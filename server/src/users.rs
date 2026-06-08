// ==============================================================================
// Copyright (C) 2026 Guilherme Pedroza
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
// ==============================================================================

use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::security::{hash_password, hash_plate};
use crate::state::SharedState;

#[derive(Deserialize)]
pub struct CreateUser {
    pub name: String,
    pub email: String,
    pub password: String,
    pub date_of_birth: Option<NaiveDate>,
    pub pcd_status: Option<bool>,
    pub plate: Option<String>,
}

#[derive(Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub date_of_birth: Option<NaiveDate>,
    pub pcd_status: Option<bool>,
    pub plate: Option<String>,
    pub role: String,
    pub created_at: Option<DateTime<Utc>>,
}

pub async fn create_user(
    State(state): State<SharedState>,
    Json(payload): Json<CreateUser>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let new_id = Uuid::new_v4();

    let hashed_password = hash_password(&payload.password).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Error hashing password".to_string(),
        )
    })?;

    let hashed_plate = payload
        .plate
        .as_deref()
        .map(|p| hash_plate(p, &state.plate_pepper));

    let record = sqlx::query!(
        r#"
        INSERT INTO users (id, name, email, password_hash, date_of_birth, pcd_status, plate)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
        id,
        name as "name!",
        email as "email!",
        date_of_birth,
        pcd_status,
        plate,
        role as "role!",
        created_at as "created_at?"
        "#,
        new_id,
        payload.name,
        payload.email,
        hashed_password,
        payload.date_of_birth,
        payload.pcd_status,
        hashed_plate,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error: {}", e);
        if e.to_string().contains("duplicate key value") {
            (
                StatusCode::CONFLICT,
                "Email or Plate already registered".to_string(),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create user".to_string(),
            )
        }
    })?;

    let response = UserResponse {
        id: record.id,
        name: record.name,
        email: record.email,
        date_of_birth: record.date_of_birth,
        pcd_status: record.pcd_status,
        plate: record.plate,
        role: record.role,
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
        SELECT 
        id,
        name as "name!",
        email as "email!",
        date_of_birth,
        pcd_status,
        plate,
        role as "role!",
        created_at as "created_at?"
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
