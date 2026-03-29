use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SpotStatus {
    Free,
    Occupied,
}

pub struct AppState {
    pub spots: RwLock<HashMap<String, SpotStatus>>,
    pub tx: broadcast::Sender<String>,
    pub db_pool: PgPool,
}

pub type SharedState = Arc<AppState>;

pub fn init_state(db_pool: PgPool) -> SharedState {
    let mut map = HashMap::new();
    map.insert("A-01".to_string(), SpotStatus::Free);
    map.insert("A-02".to_string(), SpotStatus::Free);

    let (tx, _) = broadcast::channel(100);

    Arc::new(AppState {
        spots: RwLock::new(map),
        tx,
        db_pool,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_state_initialization() {
        let state = init_state();
        let map = state.spots.read().await;

        assert_eq!(map.get("A-01"), Some(&SpotStatus::Free));
        assert_eq!(map.get("A-02"), Some(&SpotStatus::Free));
    }

    #[tokio::test]
    async fn test_state_update() {
        let state = init_state();
        {
            let mut map = state.spots.write().await;
            map.insert("A-01".to_string(), SpotStatus::Occupied);
        }
        let map = state.spots.read().await;
        assert_eq!(map.get("A-01"), Some(&SpotStatus::Occupied));
    }
}
