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

#[derive(Deserialize)]
pub struct CreateUser {
    pub plate: String,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub plate: String,
    pub created_at: Option<DateTime<Utc>>,
}

pub async fn create_user(
    State(state): State<SharedState>,
    Json(payload): Json<CreateUser>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let new_id = Uuid::new_v4();

    let record = sqlx::query!(
        r#"
        INSERT INTO users (id, plate)
        VALUES ($1, $2)
        RETURNING id, plate, created_at as "created_at?"
        "#,
        new_id,
        payload.plate
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        if e.to_string().contains("duplicate key value") {
            (StatusCode::CONFLICT, "Plate already registered".to_string())
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create user".to_string(),
            )
        }
    })?;

    let response = UserResponse {
        id: record.id,
        plate: record.plate,
        created_at: record.created_at,
    };

    Ok((StatusCode::CREATED, Json(response)))
}

pub async fn get_user(
    State(state): State<SharedState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let record = sqlx::query_as!(
        UserResponse,
        r#"
        SELECT id, plate, created_at as "created_at?"
        FROM users
        WHERE id = $1
        "#,
        id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch user".to_string(),
        )
    })?;

    match record {
        Some(user) => Ok((StatusCode::OK, Json(user))),
        None => Err((StatusCode::NOT_FOUND, "User not found".to_string())),
    }
}
