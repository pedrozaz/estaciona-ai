use axum::{
    routing::{get, post, delete},
    Router, Json, http::StatusCode
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct CreateReservationRequest {
    pub spot_id: String,
    pub plate: String,
}

#[derive(Serialize)]
pub struct ReservationResponse {
    pub id: String,
    pub spot_id: String,
    pub status: String,
}


async fn create_reservation_endpoint(
    Json(payload): Json<CreateReservationRequest>,

) -> (StatusCode, Json<ReservationResponse>) {

    let mock_response = ReservationResponse {
        id: "mock_uuid_1234".to_string(),
        spot_id: payload.spot_id,
        status: "RESERVED".to_string()
    };

    (StatusCode::CREATED, Json(mock_response))
}

async fn cancel_reservation_endpoint() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn get_spots_endpoint() -> (StatusCode, Json<Vec<String>>) {
    let spots = vec!["A1".to_string(), "B2".to_string()];
    (StatusCode::OK, Json(spots))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/reservations", post(create_reservation_endpoint))
        .route("/reservations/{id}", delete(cancel_reservation_endpoint))
        .route("/spots", get(get_spots_endpoint));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001").await.unwrap();

    axum::serve(listener, app).await.unwrap();
}
