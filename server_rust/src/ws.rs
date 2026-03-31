use crate::state::{SharedState, SpotStatus};
use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

pub mod messages;

#[derive(Deserialize, Serialize)]
pub struct SpotUpdate {
    pub r#type: String,
    pub spot_id: String,
    pub status: String,
}

// WebSocket handler for edge clients (e.g., vision devices)
pub async fn ws_edge_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_edge_socket(socket, state))
}

async fn handle_edge_socket(mut socket: WebSocket, state: SharedState) {
    tracing::info!("Edge Client (VISION) connected.");

    while let Some(msg) = socket.recv().await {
        if let Ok(Message::Text(text)) = msg
            && let Ok(update) = serde_json::from_str::<SpotUpdate>(&text)
            && update.r#type == "SPOT_UPDATE"
        {
            let new_status = match update.status.as_str() {
                "occupied" => SpotStatus::Occupied,
                _ => SpotStatus::Free,
            };

            {
                let mut map = state.spots.write().await;
                map.insert(update.spot_id.clone(), new_status);
            }

            let broadcast = serde_json::json!({
            "type": "SPOT_UPDATE",
            "spot_id": update.spot_id,
            "status": update.status,
            });

            if let Ok(json) = serde_json::to_string(&broadcast) {
                let _ = state.tx.send(json);
            }

            tracing::info!("State updated: {} -> {}", update.spot_id, update.status);
        }
    }
    tracing::info!("Edge Client (VISION) disconnected.");
}

// WebSocket handler for frontend/application
pub async fn ws_app_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_app_socket(socket, state))
}

async fn handle_app_socket(mut socket: WebSocket, state: SharedState) {
    tracing::info!("App Client (FRONTEND) connected.");
    let mut rx = state.tx.subscribe();

    // Send full state snapshot on connect
    {
        let map = state.spots.read().await;
        for (spot_id, status) in map.iter() {
            let status_str = match status {
                SpotStatus::Occupied => "occupied",
                SpotStatus::Free => "free",
            };
            let update = SpotUpdate {
                r#type: "SPOT_UPDATE".to_string(),
                spot_id: spot_id.clone(),
                status: status_str.to_string(),
            };
            if let Ok(json) = serde_json::to_string(&update) {
                let _ = socket.send(Message::Text(json.into())).await;
            }
        }
    }

    while let Ok(msg) = rx.recv().await {
        if socket.send(Message::Text(msg.into())).await.is_err() {
            break;
        }
    }
    tracing::info!("App Client (FRONTEND) disconnected.")
}
