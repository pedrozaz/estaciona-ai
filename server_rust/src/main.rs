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
        .route("/reservations", post(reservations::create_reservation))
        .route(
            "/reservations/:id/cancel",
            put(reservations::cancel_reservation),
        )
        .with_state(parking_state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("Server listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    r#"{"status": "ok"}"#
}
