use crate::state::SharedState;
use axum::{Json, extract::Path, extract::State, http::StatusCode, response::IntoResponse};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateReservation {
    pub user_id: Uuid,
    pub spot_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ReservationResponse {
    pub id: Uuid,
    pub user_id: Option<uuid::Uuid>,
    pub spot_id: String,
    pub status: String,
    pub created_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub async fn create_reservation(
    State(state): State<SharedState>,
    Json(payload): Json<CreateReservation>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let record = sqlx::query!(
        r#"
        INSERT INTO reservations (user_id, spot_id, status, expires_at)
        VALUES ($1, $2, 'active', $3)
        RETURNING id, user_id, spot_id, status, created_at, expires_at, completed_at
        "#,
        payload.user_id,
        payload.spot_id,
        payload.expires_at
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to create reservation".to_string(),
        )
    })?;

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
        SELECT id, user_id, spot_id, status, created_at, expires_at, completed_at
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
        "#,
        id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to cancel reservation".to_string(),
        )
    })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            "Active reservation not found.".to_string(),
        ));
    }

    Ok((StatusCode::OK, "Reservation cancelled.".to_string()))
}
