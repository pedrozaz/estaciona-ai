use dashmap::DashMap;
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

    // Nós físicos mockados
    let cam_entrada = graph.add_node("cam_entrada_1", 0.0, 0.0);
    let cruzamento_a = graph.add_node("cruzamento_a", 5.0, 0.0);
    let vaga_a01 = graph.add_node("A-01", 5.0, 5.0);
    let vaga_a02 = graph.add_node("A-02", 5.0, 10.0);

    graph.add_edge(cam_entrada, cruzamento_a, 5, true);
    graph.add_edge(cruzamento_a, vaga_a01, 5, true);
    graph.add_edge(cruzamento_a, vaga_a02, 10, true);

    spots.insert("A-01".to_string(), SpotStatus::Free);
    spots.insert("A-02".to_string(), SpotStatus::Free);

    let active_reservations = sqlx::query!(
        "SELECT spot_id FROM reservations WHERE status = 'active' AND expires_at > NOW()"
    )
    .fetch_optional(&pool)
    .await
    .unwrap_or_default();

    if let Some(record) = active_reservations {
        spots.insert(record.spot_id.clone(), SpotStatus::Reserved);
    }

    Arc::new(AppState {
        pool,
        spots,
        tx,
        user_sessions: DashMap::new(),
        graph: RwLock::new(graph),
    })
}
