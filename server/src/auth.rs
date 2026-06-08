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

use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};

use crate::security::{create_jwt, verify_password};
use crate::state::SharedState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub role: String,
}

pub async fn login_dashboard(
    State(state): State<SharedState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let user = sqlx::query!(
        "SELECT id, password_hash as \"password_hash!\", role FROM users WHERE email = $1",
        payload.email
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| {
        tracing::error!("Database error during login: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Database error".to_string(),
        )
    })?;

    let user_record = match user {
        Some(record) => record,
        None => return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string())),
    };

    if !verify_password(&payload.password, &user_record.password_hash) {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".to_string()));
    }

    let token = create_jwt(&payload.email, &user_record.role, &state.jwt_secret).map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed while generating access token".to_string(),
        )
    })?;

    let response = LoginResponse {
        token,
        role: user_record.role,
    };
    Ok((StatusCode::OK, Json(response)))
}
