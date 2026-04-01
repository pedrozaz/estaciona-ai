mod reservations;
mod state;
mod ws;

use axum::{
    Router,
    routing::{get, post, put},
};
use sqlx::postgres::PgPoolOptions;
use state::{SharedState, init_state};
use tokio::net::TcpListener;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use crate::state::SpotStatus;
use crate::ws::messages::ServerToAppMsg;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    dotenvy::from_path("../.env").ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL missing in .env");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Failed to connect to database");

    let parking_state: SharedState = init_state(pool);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/ws/edge", get(ws::ws_edge_handler))
        .route("/ws/app", get(ws::ws_app_handler))
        .route(
            "/reservations",
            post(reservations::create_reservation).get(reservations::get_reservations),
        )
        .route(
            "/reservations/{id}/cancel",
            put(reservations::cancel_reservation),
        )
        .with_state(parking_state.clone())
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("Server listening on {}", listener.local_addr().unwrap());

    let state_for_bg_task = parking_state;

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));

        loop {
            interval.tick().await;

            let expired_records = sqlx::query!(
                "UPDATE reservations
                SET status = 'expired'
                WHERE status = 'active' AND expires_at < NOW()
                RETURNING spot_id, user_id"
            )
            .fetch_all(&state_for_bg_task.pool)
            .await;

            if let Ok(records) = expired_records {
                for record in records {
                    state_for_bg_task
                        .spots
                        .insert(record.spot_id.clone(), SpotStatus::Free);

                    let expired_msg = ServerToAppMsg::ReservationExpired {
                        spot_id: record.spot_id.clone(),
                    };
                    if let Ok(json_str) = serde_json::to_string(&expired_msg)
                        && let Some(user_id) = record.user_id
                        && let Some(user_tx) = state_for_bg_task.user_sessions.get(&user_id)
                    {
                        let _ = user_tx.send(json_str);
                    }
                    let update_msg = ServerToAppMsg::SpotUpdate {
                        spot_id: record.spot_id,
                        status: "free".to_string(),
                    };
                    if let Ok(json_str) = serde_json::to_string(&update_msg) {
                        let _ = state_for_bg_task.tx.send(json_str);
                    }
                }
            }
        }
    });

    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    r#"{"status": "ok"}"#
}
