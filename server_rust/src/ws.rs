pub mod messages;
pub mod ws_edge;

pub use ws_edge::ws_edge_handler;

use axum::{
    extract::{
        Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::state::{SharedState, SpotStatus};
use crate::ws::messages::{AppToServerMsg, ServerToAppMsg};

#[derive(Deserialize)]
pub struct WsAppQuery {
    pub user_id: Uuid,
}

pub async fn ws_app_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsAppQuery>,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_app_socket(socket, state, query.user_id))
}

async fn handle_app_socket(socket: WebSocket, state: SharedState, user_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();

    let (private_tx, mut private_rx) = mpsc::unbounded_channel::<String>();
    state.user_sessions.insert(user_id, private_tx);

    let mut broadcast_rx = state.tx.subscribe();

    for entry in state.spots.iter() {
        let msg = ServerToAppMsg::SpotUpdate {
            spot_id: entry.key().clone(),
            status: match entry.value() {
                SpotStatus::Free => "free".to_string(),
                SpotStatus::Occupied => "occupied".to_string(),
                SpotStatus::Reserved => "reserved".to_string(),
            },
        };
        if let Ok(json_str) = serde_json::to_string(&msg) {
            let _ = sender.send(Message::Text(json_str.into())).await;
        }
    }

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                Ok(broadcast_msg) = broadcast_rx.recv() => {
                    if sender.send(Message::Text(broadcast_msg.into())).await.is_err() {
                        break;
                    }
                }
                Some(private_msg) = private_rx.recv() => {
                    if sender.send(Message::Text(private_msg.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(msg) = serde_json::from_str::<AppToServerMsg>(&text) {
                match msg {
                    AppToServerMsg::ReserveSpot { .. } => {
                        // TODO: lógica de reserva
                    }
                    AppToServerMsg::CancelReservation { .. } => {
                        // TODO: lógica de cancelamento
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    state.user_sessions.remove(&user_id);
}
