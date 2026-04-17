use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::{SharedState, SpotStatus};
use crate::ws::messages::ServerToAppMsg;

#[derive(Deserialize)]
pub struct CreateReservation {
    pub user_id: Uuid,
    pub spot_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ReservationResponse {
    pub id: Uuid,
    pub user_id: Uuid,
    pub spot_id: String,
    pub status: String,
    pub created_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub async fn create_reservation(
    State(state): State<SharedState>,
    Json(payload): Json<CreateReservation>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let reserved = if let Some(mut status) = state.spots.get_mut(&payload.spot_id) {
        if *status == SpotStatus::Free {
            *status = SpotStatus::Reserved;
            true
        } else {
            false
        }
    } else {
        false
    };

    if !reserved {
        return Err((StatusCode::CONFLICT, "Spot is not free".to_string()));
    }

    let new_id = Uuid::new_v4();

    let record = sqlx::query!(
        r#"
        INSERT INTO reservations (id, user_id, spot_id, status, expires_at)
        VALUES ($1, $2, $3, 'active', $4)
        RETURNING 
            id, 
            user_id as "user_id!", 
            spot_id, 
            status, 
            created_at as "created_at?", 
            expires_at as "expires_at?", 
            completed_at as "completed_at?"
        "#,
        new_id,
        payload.user_id,
        payload.spot_id,
        payload.expires_at
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        state
            .spots
            .insert(payload.spot_id.clone(), SpotStatus::Free);
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to create reservation".to_string(),
        )
    })?;

    let update_msg = ServerToAppMsg::SpotUpdate {
        spot_id: payload.spot_id.clone(),
        status: "reserved".to_string(),
    };

    if let Ok(json_str) = serde_json::to_string(&update_msg) {
        let _ = state.tx.send(json_str);
    }

    let response = ReservationResponse {
        id: record.id,
        user_id: record.user_id,
        spot_id: record.spot_id,
        status: record.status,
        created_at: record.created_at,
        expires_at: record.expires_at,
        completed_at: record.completed_at,
    };

    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn get_reservations(
    State(state): State<SharedState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let records = sqlx::query_as!(
        ReservationResponse,
        r#"
        SELECT 
            id, 
            user_id as "user_id!", 
            spot_id, 
            status, 
            created_at as "created_at?", 
            expires_at as "expires_at?", 
            completed_at as "completed_at?"
        FROM reservations
        WHERE status = 'active'
        "#
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch reservations".to_string(),
        )
    })?;

    Ok((StatusCode::OK, Json(records)))
}

pub async fn cancel_reservation(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let result = sqlx::query!(
        r#"
        UPDATE reservations
        SET status = 'cancelled'
        WHERE id = $1 AND status = 'active'
        RETURNING spot_id
        "#,
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to cancel reservation".to_string(),
        )
    })?;

    match result {
        Some(record) => {
            state.spots.insert(record.spot_id.clone(), SpotStatus::Free);

            let update_msg = ServerToAppMsg::SpotUpdate {
                spot_id: record.spot_id,
                status: "free".to_string(),
            };

            if let Ok(json_str) = serde_json::to_string(&update_msg) {
                let _ = state.tx.send(json_str);
            }

            Ok((StatusCode::OK, "Reservation cancelled.".to_string()))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            "Active reservation not found.".to_string(),
        )),
    }
}
