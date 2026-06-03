use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::SharedState;
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
    let updated_spot = sqlx::query!(
        "UPDATE spots SET status = 'reserved', last_updated = NOW()
        WHERE id = $1 AND status = 'free' RETURNING id",
        payload.spot_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database error".to_string(),
        )
    })?;

    if updated_spot.is_none() {
        return Err((StatusCode::CONFLICT, "Spot is not free".to_string()));
    }

    let new_id = Uuid::new_v4();

    let record = sqlx::query!(
        r#"
        INSERT INTO reservations (id, user_id, spot_id, status, expires_at)
        VALUES ($1, $2, $3, 'active', $4)
        RETURNING id, user_id as "user_id!", spot_id, status, created_at as
        "created_at?", expires_at as "expires_at?", completed_at as "completed_at?"
        "#,
        new_id,
        payload.user_id,
        payload.spot_id,
        payload.expires_at
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|_| {
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

    Ok(Json(ReservationResponse {
        id: record.id,
        user_id: record.user_id,
        spot_id: record.spot_id,
        status: record.status,
        created_at: record.created_at,
        expires_at: record.expires_at,
        completed_at: record.completed_at,
    }))
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
            let _ = sqlx::query!(
                "UPDATE spots SET status = 'free', last_updated = NOW() WHERE id = $1",
                record.spot_id
            )
            .execute(&state.pool)
            .await;

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

pub async fn confirm_occupancy(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let reservation = sqlx::query!(
    "UPDATE reservations SET completed_at = NOW() WHERE id = $1 AND status = 'active' RETURNING user_id, spot_id",
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string()))?;

    match reservation {
        Some(res) => {
            let _ = sqlx::query!(
                "INSERT INTO user_occupancy_history (user_id, spot_id) VALUES ($1, $2)",
                res.user_id,
                res.spot_id
            )
            .execute(&state.pool)
            .await;

            let _ = sqlx::query!(
                r#"
            DELETE FROM user_occupancy_history
            WHERE id IN (
                SELECT id FROM user_occupancy_history
                WHERE user_id = $1
                ORDER BY occupied_at DESC
                OFFSET 30
            )
            "#,
                res.user_id
            )
            .execute(&state.pool)
            .await;

            Ok((
                StatusCode::OK,
                "Occupancy confirmed and history saved.".to_string(),
            ))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            "Active reservation not found".to_string(),
        )),
    }
}

use axum::extract::Query;

#[derive(Deserialize)]
pub struct RecommendQuery {
    pub user_id: Uuid,
}

pub async fn recommend_spot(
    State(state): State<SharedState>,
    Query(query): Query<RecommendQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let favorite_spot = sqlx::query!(
        r#"
        SELECT h.spot_id, COUNT(*) as uses 
        FROM user_occupancy_history h 
        JOIN spots s ON s.id = h.spot_id
        WHERE h.user_id = $1 AND s.status = 'free'
        GROUP BY h.spot_id
        ORDER BY uses DESC
        LIMIT 1
        "#,
        query.user_id
    )
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if let Some(fav) = favorite_spot {
        return Ok((
            StatusCode::OK,
            Json(serde_json::json!({ "recommended_spot": fav.spot_id })),
        ));
    }

    let fallback = sqlx::query!("SELECT id FROM spots WHERE status = 'free' LIMIT 1")
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    match fallback {
        Some(spot) => Ok((
            StatusCode::OK,
            Json(serde_json::json!({
            "recommended_spot": spot.id })),
        )),
        None => Err((StatusCode::NOT_FOUND, "Estacionamento Lotado".to_string())),
    }
}
