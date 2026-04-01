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
                    let new_status = if status == "occupied" {
                        SpotStatus::Occupied
                    } else {
                        SpotStatus::Free
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
    let user_record = sqlx::query!("SELECT id FROM users WHERE plate = $1", plate)
        .fetch_optional(&state.pool)
        .await;

    let user_id = match user_record {
        Ok(Some(record)) => record.id,
        _ => return,
    };

    let reservation = sqlx::query!(
        "SELECT id, spot_id FROM reservations WHERE user_id = $1 AND status = 'active' LIMIT 1",
        user_id
    )
    .fetch_optional(&state.pool)
    .await;

    let spot_id = if let Ok(Some(res)) = reservation {
        res.spot_id
    } else {
        let best_spot = state
            .spots
            .iter()
            .find(|entry| *entry.value() == SpotStatus::Free)
            .map(|entry| entry.key().clone());

        if let Some(spot) = best_spot {
            let new_res_id = Uuid::new_v4();
            let expires_at = Utc::now() + Duration::minutes(15);

            let _ = sqlx::query!(
                "INSERT INTO reservations (id, user_id, spot_id, status, expires_at) VALUES ($1, $2, $3, 'active', $4)",
                new_res_id, user_id, spot, expires_at
            )
            .execute(&state.pool)
            .await;

            state.spots.insert(spot.clone(), SpotStatus::Reserved);
            spot
        } else {
            return;
        }
    };

    let route = state
        .graph
        .calculate_route(&camera_id, &spot_id)
        .unwrap_or_else(|| vec![camera_id.clone(), spot_id.clone()]);

    if let Some(session_tx) = state.user_sessions.get(&user_id) {
        let nav_msg = ServerToAppMsg::NavigationStart { spot_id, route };

        if let Ok(json_str) = serde_json::to_string(&nav_msg) {
            let _ = session_tx.send(json_str);
        }
    }
}
