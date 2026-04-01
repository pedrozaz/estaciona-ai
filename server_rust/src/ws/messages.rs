use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum AppToServerMsg {
    #[serde(rename = "RESERVE_SPOT")]
    ReserveSpot {
        spot_id: String,
        user_id: Uuid,
        plate: String,
    },
    #[serde(rename = "CANCEL_RESERVATION")]
    CancelReservation { reservation_id: Uuid },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum EdgeToServerMsg {
    #[serde(rename = "SPOT_UPDATE")]
    SpotUpdate {
        spot_id: String,
        status: String,
        camera_id: String,
        confidence: f64,
        timestamp: DateTime<Utc>,
    },
    #[serde(rename = "CAR_DETECTED")]
    CarDetected {
        plate: String,
        camera_id: String,
        timestamp: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub enum ServerToAppMsg {
    #[serde(rename = "NAVIGATION_START")]
    NavigationStart { spot_id: String, route: Vec<String> },
    #[serde(rename = "RESERVATION_CONFIRMED")]
    ReservationConfirmed {
        reservation_id: Uuid,
        spot_id: String,
        expires_at: DateTime<Utc>,
    },
    #[serde(rename = "RESERVATION_EXPIRED")]
    ReservationExpired { spot_id: String },
    #[serde(rename = "RESERVATION_REJECTED")]
    ReservationRejected { spot_id: String, reason: String },
    #[serde(rename = "SPOT_UPDATE")]
    SpotUpdate { spot_id: String, status: String },
    #[serde(rename = "ROUTE_UPDATE")]
    RouteUpdate { spot_id: String, route: Vec<String> },
}
