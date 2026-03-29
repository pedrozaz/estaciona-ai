use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SpotStatus {
    Free,
    Occupied,
}

pub type SharedState = Arc<RwLock<HashMap<String, SpotStatus>>>;

pub fn init_state() -> SharedState {
    let mut map = HashMap::new();

    map.insert("A-01".to_string(), SpotStatus::Free);
    map.insert("A-02".to_string(), SpotStatus::Free);
    Arc::new(RwLock::new(map))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_state_initialization() {
        let state = init_state();
        let map = state.read().await;

        assert_eq!(map.get("A-01"), Some(&SpotStatus::Free));
        assert_eq!(map.get("A-02"), Some(&SpotStatus::Free));
    }

    #[tokio::test]
    async fn test_state_update() {
        let state = init_state();

        {
            let mut map = state.write().await;
            map.insert("A-01".to_string(), SpotStatus::Occupied);
        }

        let map = state.read().await;
        assert_eq!(map.get("A-01"), Some(&SpotStatus::Occupied));
    }
}
