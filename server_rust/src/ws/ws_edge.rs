use axum::extract::ws::{Message, WebSocket};
use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
};
use chrono::{Duration, Utc};
use futures_util::StreamExt;
use uuid::Uuid;

use crate::state::{SharedState, SpotStatus};
use crate::ws::messages::{EdgeToServerMsg, ServerToAppMsg};

pub async fn ws_edge_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
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
                    spot_id, status, ..
                } => {
                    let new_status = match status.as_str() {
                        "occupied" => SpotStatus::Occupied,
                        "free" => SpotStatus::Free,
                        other => {
                            eprintln!("Ignoring SpotUpdate with invalid status: {}", other);
                            continue;
                        }
                    };

                    state.spots.insert(spot_id.clone(), new_status);

                    let update_msg = ServerToAppMsg::SpotUpdate { spot_id, status };

                    if let Ok(json_str) = serde_json::to_string(&update_msg) {
                        let _ = state.tx.send(json_str);
                    }
                }
            }
        }
    }
}

async fn handle_car_detected(state: &SharedState, plate: String, camera_id: String) {
    // 1. Validação do usuário
    let user_record = sqlx::query!("SELECT id FROM users WHERE plate = $1", plate)
        .fetch_optional(&state.pool)
        .await;

    let user_id = match user_record {
        Ok(Some(record)) => record.id,
        _ => return, // Ignora veículos não cadastrados
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
            .calculate_route(&camera_id, &res.spot_id)
            .unwrap_or_else(|| vec![camera_id.clone(), res.spot_id.clone()]);

        (res.spot_id, route)
    } else {
        // Fluxo sem reserva: Usa o Grafo para varrer todas as vagas livres e achar a rota mais curta
        let mut best_spot: Option<String> = None;
        let mut best_route: Option<Vec<String>> = None;
        let mut min_route_length = usize::MAX;

        for entry in state.spots.iter() {
            if *entry.value() == SpotStatus::Free
                && let Some(route) = state.graph.calculate_route(&camera_id, entry.key())
                && route.len() < min_route_length
            {
                min_route_length = route.len();
                best_spot = Some(entry.key().clone());
                best_route = Some(route);
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
                    state.spots.insert(spot.clone(), SpotStatus::Reserved);

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
