use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};

use crate::security::{create_jwt, verify_password};
use crate::state::SharedState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
}
pub async fn login_dashboard(
    State(state): State<SharedState>,
    Json(payload): Json<LoginRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let admin = sqlx::query!(
        "SELECT id, password_hash FROM dashboard_admins WHERE username = $1",
        payload.username
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

    let admin_record = match admin {
        Some(record) => record,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Credenciais inválidas".to_string(),
            ));
        }
    };

    if !verify_password(&payload.password, &admin_record.password_hash) {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Credenciais inválidas".to_string(),
        ));
    }

    let token =
        create_jwt(&payload.username, "dashboard_admin", &state.jwt_secret).map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Falha ao gerar o token de acesso".to_string(),
            )
        })?;

    let response = LoginResponse { token };
    Ok((StatusCode::OK, Json(response)))
}
