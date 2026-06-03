use dashmap::DashMap;
use serde::Deserialize;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, mpsc};
use uuid::Uuid;

use crate::pathfinding::ParkingGraph;

pub struct AppState {
    pub pool: PgPool,
    pub tx: broadcast::Sender<String>,
    pub user_sessions: DashMap<Uuid, mpsc::UnboundedSender<String>>,
    pub graph: RwLock<ParkingGraph>,
    pub jwt_secret: String,
    pub plate_pepper: String,
}

pub type SharedState = Arc<AppState>;

pub async fn init_state(pool: PgPool, jwt_secret: String, plate_pepper: String) -> SharedState {
    let (tx, _) = broadcast::channel(100);

    let mut graph = ParkingGraph::new();

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

    // -- INÍCIO DA SINCRONIZAÇÃO DAS VAGAS 3D --
    #[derive(Deserialize)]
    struct Spot3DDef {
        id: String,
    }

    let spots_3d_content =
        std::fs::read_to_string("../web/data/spots_3d.json").expect("Falha ao ler spots_3d.json");
    let spots_3d: Vec<Spot3DDef> =
        serde_json::from_str(&spots_3d_content).expect("Falha no parse do spots_3d.json");

    for spot in spots_3d {
        sqlx::query!(
            r#"
            INSERT INTO spots (id, parking_lot, status, last_updated) 
            VALUES ($1, 'Main', 'free', NOW()) 
            ON CONFLICT (id) DO NOTHING
            "#,
            spot.id
        )
        .execute(&pool)
        .await
        .expect("Falha ao sincronizar vaga com o banco de dados");
    }
    // -- FIM DA SINCRONIZAÇÃO DAS VAGAS 3D --

    for n in config.nodes {
        let graph_node = graph.add_node(&n.id, n.x, n.y);
        node_map.insert(n.id, graph_node);
    }

    for e in config.edges {
        if let (Some(&from_node), Some(&to_node)) = (node_map.get(&e.from), node_map.get(&e.to)) {
            graph.add_edge(from_node, to_node, e.weight, e.is_active);
        }
    }

    Arc::new(AppState {
        pool,
        tx,
        user_sessions: DashMap::new(),
        graph: RwLock::new(graph),
        jwt_secret,
        plate_pepper,
    })
}
