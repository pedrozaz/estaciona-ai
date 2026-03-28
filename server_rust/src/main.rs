mod state;

use axum::{Router, routing::get};
use state::{SharedState, init_state};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let parking_state: SharedState = init_state();

    let app = Router::new()
        .route("/health", get(health_check))
        .with_state(parking_state)
        .layer(TraceLayer::new_for_http());

    let listener = TcpListener::bind("0.0.0.0:8000").await.unwrap();
    tracing::info!("Server listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    r#"{"status": "ok"}"#
}
