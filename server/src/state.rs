use dashmap::DashMap;
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, mpsc};
use uuid::Uuid;

use crate::pathfinding::ParkingGraph;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpotStatus {
    Free,
    Occupied,
    Reserved,
}

pub struct AppState {
    pub pool: PgPool,
    pub spots: DashMap<String, SpotStatus>,
    pub tx: broadcast::Sender<String>,
    pub user_sessions: DashMap<Uuid, mpsc::UnboundedSender<String>>,
    pub graph: RwLock<ParkingGraph>,
}

pub type SharedState = Arc<AppState>;

pub async fn init_state(pool: PgPool) -> SharedState {
    let (tx, _) = broadcast::channel(100);

    let mut graph = ParkingGraph::new();
    let spots = DashMap::new();

    #[derive(Deserialize)]
    struct NodeDef {
        id: String,
        x: f32,
        y: f32,
    }
    #[derive(Deserialize)]
    struct EdgeDef {
        from: String,
        to: String,
        weight: u32,
        is_active: bool,
    }
    #[derive(Deserialize)]
    struct ConfigDef {
        nodes: Vec<NodeDef>,
        edges: Vec<EdgeDef>,
    }

    let file_content =
        std::fs::read_to_string("parking_graph.json").expect("Falha ao ler parking_graph.json");
    let config: ConfigDef =
        serde_json::from_str(&file_content).expect("Falha no parse do parking_graph.json");

    let mut node_map = std::collections::HashMap::new();

    for n in config.nodes {
        if n.id.starts_with("A-") {
            spots.insert(n.id.clone(), SpotStatus::Free);
        }
        let graph_node = graph.add_node(&n.id, n.x, n.y);
        node_map.insert(n.id, graph_node);
    }

    for e in config.edges {
        if let (Some(&from_node), Some(&to_node)) = (node_map.get(&e.from), node_map.get(&e.to)) {
            graph.add_edge(from_node, to_node, e.weight, e.is_active);
        }
    }

    let active_reservations = sqlx::query!(
        "SELECT spot_id FROM reservations WHERE status = 'active' AND expires_at > NOW()"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for record in active_reservations {
        spots.insert(record.spot_id, SpotStatus::Reserved);
    }

    Arc::new(AppState {
        pool,
        spots,
        tx,
        user_sessions: DashMap::new(),
        graph: RwLock::new(graph),
    })
}
