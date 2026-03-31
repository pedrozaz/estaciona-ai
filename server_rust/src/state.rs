use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SpotStatus {
    Free,
    Occupied,
    Reserved,
}

pub struct AppState {
    pub spots: DashMap<String, SpotStatus>,
    pub tx: broadcast::Sender<String>,
    pub pool: PgPool,
    pub user_sessions: DashMap<Uuid, mpsc::UnboundedSender<String>>,
}

pub type SharedState = Arc<AppState>;

pub fn init_state(pool: PgPool) -> SharedState {
    let spots = DashMap::new();
    spots.insert("A-01".to_string(), SpotStatus::Free);
    spots.insert("A-02".to_string(), SpotStatus::Free);

    let (tx, _) = broadcast::channel(100);

    Arc::new(AppState {
        spots,
        tx,
        pool,
        user_sessions: DashMap::new(),
    })
}
