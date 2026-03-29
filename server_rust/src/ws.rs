use crate::state::{SharedState, SpotStatus};
use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SpotUpdate {
    pub r#type: String,
    pub spot_id: String,
    pub status: String,
}

pub async fn ws_edge_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_edge_socket(socket, state))
}

async fn handle_edge_socket(mut socket: WebSocket, state: SharedState) {
    tracing::info!("Edge Client (VISION) connected.");

    while let Some(msg) = socket.recv().await {
        if let Ok(Message::Text(text)) = msg {
            if let Ok(update) = serde_json::from_str::<SpotUpdate>(&text) {
                if update.r#type == "SPOT_UPDATE" {
                    let new_status = match update.status.as_str() {
                        "occupied" => SpotStatus::Occupied,
                        _ => SpotStatus::Free,
                    };
                    let mut map = state.write().await;
                    map.insert(update.spot_id.clone(), new_status);

                    tracing::info!("State updated: {} -> {}", update.spot_id, update.status);
                }
            }
        }
    }

    tracing::info!("Edge Client (VISION) disconnected.");
}
