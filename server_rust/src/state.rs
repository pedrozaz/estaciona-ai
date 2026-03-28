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