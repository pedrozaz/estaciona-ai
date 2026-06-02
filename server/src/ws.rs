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

use crate::state::SharedState;
use crate::ws::messages::{AppToServerMsg, ServerToAppMsg};

#[derive(Deserialize)]
pub struct WsAppQuery {
    pub user_id: Uuid,
    pub token: String,
}

pub async fn ws_app_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsAppQuery>,
    State(state): State<SharedState>,
) -> axum::response::Response {
    let claims = match crate::security::verify_jwt(&query.token, &state.jwt_secret) {
        Ok(c) => c,
        Err(_) => {
            return (
                axum::http::StatusCode::UNAUTHORIZED,
                "Invalid or expired JWT token",
            )
                .into_response();
        }
    };
    if claims.sub != query.user_id.to_string() {
        return (
            axum::http::StatusCode::FORBIDDEN,
            "Token does not match user_id",
        )
            .into_response();
    }
    ws.on_upgrade(move |socket| handle_app_socket(socket, state, query.user_id))
        .into_response()
}

async fn handle_app_socket(socket: WebSocket, state: SharedState, user_id: Uuid) {
    let (mut sender, mut receiver) = socket.split();

    let (private_tx, mut private_rx) = mpsc::unbounded_channel::<String>();
    state.user_sessions.insert(user_id, private_tx.clone());

    let mut broadcast_rx = state.tx.subscribe();

    let db_spots = sqlx::query!("SELECT id, status FROM spots").fetch_all(&state.pool).await.unwrap_or_default();
    for row in db_spots {
        let msg = ServerToAppMsg::SpotUpdate {
            spot_id: row.id,
            status: row.status,
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
                    AppToServerMsg::ReserveSpot { spot_id, .. } => {
                        let state_clone = value.clone();

                        let reserved_spot = sqlx::query!(
                            "UPDATE spots SET status = 'reserved', last_updated = NOW() WHERE id = $1 AND status = 'free' RETURNING id",
                            spot_id
                        )
                        .fetch_optional(&state_clone.pool)
                        .await
                        .unwrap_or(None);
                        
                        let reserved = reserved_spot.is_some();

                        if reserved {
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
                            } else {
                                let _ = sqlx::query!("UPDATE spots SET status = 'free', last_updated = NOW() WHERE id = $1", spot_id)
                                    .execute(&state_clone.pool)
                                    .await;
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
                            WHERE id = $1 AND user_id = $2 AND status = 'active'
                            RETURNING spot_id",
                            reservation_id,
                            user_id
                        )
                        .fetch_optional(&state_clone.pool)
                        .await;

                        if let Ok(Some(row)) = res {
                            let _ = sqlx::query!(
                                "UPDATE spots SET status = 'free', last_updated = NOW() WHERE id = $1",
                                row.spot_id
                            )
                            .execute(&state_clone.pool)
                            .await;

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

pub async fn ws_dashboard_handler(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_dashboard_socket(socket, state))
        .into_response()
}

async fn handle_dashboard_socket(mut socket: WebSocket, state: SharedState) {
    let mut broadcast_rx = state.tx.subscribe();

    let db_spots = sqlx::query!("SELECT id, status FROM spots").fetch_all(&state.pool).await.unwrap_or_default();
    for row in db_spots {
        let msg = ServerToAppMsg::SpotUpdate {
            spot_id: row.id,
            status: row.status,
        };
        if let Ok(json_str) = serde_json::to_string(&msg) {
            let _ = socket.send(Message::Text(json_str.into())).await;
        }
    }

    while let Ok(broadcast_msg) = broadcast_rx.recv().await {
        if socket.send(Message::Text(broadcast_msg.into())).await.is_err() {
            break;
        }
    }
}
