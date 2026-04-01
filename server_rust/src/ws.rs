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
use chrono::{Duration, Utc};
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
    state.user_sessions.insert(user_id, private_tx.clone());

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

    let value = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(msg) = serde_json::from_str::<AppToServerMsg>(&text) {
                match msg {
                    AppToServerMsg::ReserveSpot {
                        spot_id, ..
                    } => {
                        let state_clone = value.clone();

                        let is_free = state_clone
                            .spots
                            .get(&spot_id)
                            .map(|s| *s == SpotStatus::Free)
                            .unwrap_or(false);

                        if is_free {
                            let res_id = Uuid::new_v4();
                            let expires = Utc::now() + Duration::minutes(15);

                            let db_result = sqlx::query!(
                                "INSERT INTO reservations (id, user_id, spot_id, status, expires_at)
                                VALUES ($1, $2, $3, 'active', $4)",
                                res_id, user_id, spot_id, expires
                            )
                            .execute(&state_clone.pool)
                            .await;

                            if db_result.is_ok() {
                                state_clone
                                    .spots
                                    .insert(spot_id.clone(), SpotStatus::Reserved);

                                let confirm = ServerToAppMsg::ReservationConfirmed {
                                    reservation_id: res_id,
                                    spot_id: spot_id.clone(),
                                    expires_at: expires,
                                };

                                let update = ServerToAppMsg::SpotUpdate {
                                    spot_id: spot_id.clone(),
                                    status: "reserved".to_string(),
                                };

                                if let Ok(json) = serde_json::to_string(&confirm) {
                                    let _ = private_tx.send(json);
                                }
                                if let Ok(json) = serde_json::to_string(&update) {
                                    let _ = state_clone.tx.send(json);
                                }
                            }
                        } else {
                            let reject = ServerToAppMsg::ReservationRejected {
                                spot_id,
                                reason: "already_taken".to_string(),
                            };
                            if let Ok(json) = serde_json::to_string(&reject) {
                                let _ = private_tx.send(json);
                            }
                        }
                    }
                    AppToServerMsg::CancelReservation { reservation_id } => {
                        let state_clone = value.clone();

                        let res = sqlx::query!(
                            "UPDATE reservations SET status = 'cancelled'
                            WHERE id = $1 AND status = 'active'
                            RETURNING spot_id",
                            reservation_id
                        )
                        .fetch_optional(&state_clone.pool)
                        .await;

                        if let Ok(Some(row)) = res {
                            state_clone
                                .spots
                                .insert(row.spot_id.clone(), SpotStatus::Free);

                            let update = ServerToAppMsg::SpotUpdate {
                                spot_id: row.spot_id,
                                status: "free".to_string(),
                            };

                            if let Ok(json) = serde_json::to_string(&update) {
                                let _ = state_clone.tx.send(json);
                            }
                        }
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
