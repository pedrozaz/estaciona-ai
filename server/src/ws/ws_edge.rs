use axum::extract::ws::{Message, WebSocket};
use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
};
use chrono::{Duration, Utc};
use futures_util::StreamExt;
use uuid::Uuid;

use crate::state::SharedState;
use crate::ws::messages::{EdgeToServerMsg, ServerToAppMsg};

pub async fn ws_edge_handler(
    ws: WebSocketUpgrade,
    headers: axum::http::HeaderMap,
    State(state): State<SharedState>,
) -> axum::response::Response {
    let api_key = std::env::var("EDGE_API_KEY").unwrap_or_else(|_| "secret_edge_key".to_string());
    let expected_auth = format!("Bearer {}", api_key);

    let is_authorized = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .map(|h| h == expected_auth)
        .unwrap_or(false);

    if !is_authorized {
        return (axum::http::StatusCode::UNAUTHORIZED, "Invalid Edge API Key").into_response();
    }

    tracing::info!("[WS EDGE] Camera connected with valid API key.");

    ws.on_upgrade(|socket| handle_edge_socket(socket, state))
}

async fn handle_edge_socket(mut socket: WebSocket, state: SharedState) {
    while let Some(Ok(msg)) = socket.next().await {
        if let Message::Text(text) = msg
            && let Ok(edge_msg) = serde_json::from_str::<EdgeToServerMsg>(&text)
        {
            match edge_msg {
                EdgeToServerMsg::CarDetected {
                    plate, camera_id, ..
                } => {
                    handle_car_detected(&state, plate, camera_id).await;
                }
                EdgeToServerMsg::SpotUpdate {
                    spot_id,
                    status,
                    confidence,
                    ..
                } => {
                    if confidence < 0.60 {
                        tracing::debug!(
                            "Ignorando SpotUpdate para {} devido a baixa confiança ({})",
                            spot_id,
                            confidence
                        );
                        continue;
                    }

                    if status != "occupied" && status != "free" {
                        eprintln!("Ignoring SpotUpdate with invalid status: {}", status);
                        continue;
                    }

                    let _ = sqlx::query!(
                        "UPDATE spots SET status = $1, last_updated = NOW() WHERE id = $2",
                        status,
                        spot_id
                    )
                    .execute(&state.pool)
                    .await;

                    tracing::info!(
                        "[WS EDGE] Spot {} updated to {} (Confidence: {:.2})",
                        spot_id,
                        status,
                        confidence
                    );

                    let update_msg = ServerToAppMsg::SpotUpdate { spot_id, status };

                    if let Ok(json_str) = serde_json::to_string(&update_msg) {
                        let _ = state.tx.send(json_str);
                    }
                }
                EdgeToServerMsg::PathUpdate {
                    from_node,
                    to_node,
                    is_active,
                } => {
                    let mut graph_write = state.graph.write().await;
                    graph_write.set_edge_status(&from_node, &to_node, is_active);
                    tracing::info!(
                        "Path update: {} -> {} active: {}",
                        from_node,
                        to_node,
                        is_active
                    );
                }
            }
        }
    }

    tracing::info!("[WS EDGE] Camera disconnected.");
}

async fn handle_car_detected(state: &SharedState, plate: String, camera_id: String) {
    let hashed_plate = crate::security::hash_plate(&plate, &state.plate_pepper);

    // 1. Validação do usuário
    let user_record = sqlx::query!("SELECT id FROM users WHERE plate = $1", hashed_plate)
        .fetch_optional(&state.pool)
        .await;

    let user_id = match user_record {
        Ok(Some(record)) => record.id,
        _ => {
            tracing::warn!("Veículo não cadastrado detectado e ignorado.",);
            return;
        }
    };

    // 2. Verifica reserva ativa
    let reservation = sqlx::query!(
        "SELECT id, spot_id FROM reservations WHERE user_id = $1 AND status = 'active' LIMIT 1",
        user_id
    )
    .fetch_optional(&state.pool)
    .await;

    // 3. Define a vaga e a rota final
    let (spot_id, final_route) = if let Ok(Some(res)) = reservation {
        // Fluxo com reserva prévia
        let route = state
            .graph
            .read()
            .await
            .calculate_route(&camera_id, &res.spot_id)
            .unwrap_or_else(|| vec![camera_id.clone(), res.spot_id.clone()]);

        (res.spot_id, route)
    } else {
        // Fluxo sem reserva: Usa o Grafo para varrer todas as vagas livres e achar a rota mais curta
        let mut best_spot: Option<String> = None;
        let mut best_route: Option<Vec<String>> = None;
        let mut min_route_length = usize::MAX;

        let graph = state.graph.read().await;

        let free_spots = sqlx::query!("SELECT id FROM spots WHERE status = 'free'")
            .fetch_all(&state.pool)
            .await
            .unwrap_or_default();

        for row in free_spots {
            if let Some(route) = graph.calculate_route(&camera_id, &row.id) {
                if route.len() < min_route_length {
                    min_route_length = route.len();
                    best_spot = Some(row.id);
                    best_route = Some(route);
                }
            }
        }

        if let (Some(spot), Some(route)) = (best_spot, best_route) {
            let new_res_id = Uuid::new_v4();
            let expires_at = Utc::now() + Duration::minutes(15);

            let insert_result = sqlx::query!(
                "INSERT INTO reservations (id, user_id, spot_id, status, expires_at) VALUES ($1, $2, $3, 'active', $4)",
                new_res_id, user_id, spot, expires_at
            )
            .execute(&state.pool)
            .await;

            match insert_result {
                Ok(res) if res.rows_affected() > 0 => {
                    let _ = sqlx::query!(
                        "UPDATE spots SET status = 'reserved', last_updated = NOW() WHERE id = $1",
                        spot
                    )
                    .execute(&state.pool)
                    .await;

                    // Dispara broadcast de SPOT_UPDATE para os outros clientes saberem que a vaga foi ocupada
                    let update_msg = ServerToAppMsg::SpotUpdate {
                        spot_id: spot.clone(),
                        status: "reserved".to_string(),
                    };
                    if let Ok(json_str) = serde_json::to_string(&update_msg) {
                        let _ = state.tx.send(json_str);
                    }

                    (spot, route)
                }
                _ => return, // Falha de persistência
            }
        } else {
            // Nenhuma vaga livre alcançável encontrada
            return;
        }
    };

    // 4. Envia o comando de navegação para a sessão do usuário
    if let Some(session_tx) = state.user_sessions.get(&user_id) {
        let nav_msg = ServerToAppMsg::NavigationStart {
            spot_id,
            route: final_route,
        };

        if let Ok(json_str) = serde_json::to_string(&nav_msg) {
            let _ = session_tx.send(json_str);
        }
    }
}
