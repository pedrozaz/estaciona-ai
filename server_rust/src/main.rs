mod state;
mod ws;

use axum::{Router, routing::get};
use state::{SharedState, init_state};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    dotenvy::dotenv().ok();

    let db_url = std::env::var("DATABASE_URL").expect("Database URL not found");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .expect("Failed to connect to database");

    let parking_state: SharedState = init_state(pool);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/ws/edge", get(ws::ws_edge_handler))
        .route("/ws/app", get(ws::ws_app_handler))
        .with_state(parking_state)
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("Server listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    r#"{"status": "ok"}"#
}
