// ==============================================================================
// Copyright (C) 2026 Guilherme Pedroza
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
// ==============================================================================

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
    struct PathNode {
        x: f64,
        y: f64,
        z: f64,
    }

    #[derive(Deserialize)]
    struct ParkingLotConfig {
        name: String,
        path: Vec<PathNode>,
    }

    let config_content =
        std::fs::read_to_string("../web/data/config.json").expect("Falha ao ler config.json");
    let parkings: Vec<ParkingLotConfig> =
        serde_json::from_str(&config_content).expect("Falha no parse do config.json");

    let mut node_map = std::collections::HashMap::new();
    let mut config_nodes = Vec::new();

    if let Some(parking) = parkings.first() {
        let mut prev_node_id: Option<String> = None;
        for (i, p) in parking.path.iter().enumerate() {
            let node_id = if i == 0 { "cam-01".to_string() } else { format!("path_node_{}", i) };
            
            let graph_node = graph.add_node(&node_id, p.x as f32, p.z as f32);
            node_map.insert(node_id.clone(), graph_node);
            config_nodes.push((node_id.clone(), p.x, p.z));

            if let Some(prev_id) = &prev_node_id {
                if let (Some(&from_node), Some(&to_node)) = (node_map.get(prev_id), node_map.get(&node_id)) {
                    let prev_p = &parking.path[i - 1];
                    let dist = ((p.x - prev_p.x).powi(2) + (p.z - prev_p.z).powi(2)).sqrt() as u32;
                    graph.add_edge(from_node, to_node, dist.max(1), true);
                }
            }
            prev_node_id = Some(node_id);
        }
    }

    #[derive(Deserialize)]
    struct Coords3D {
        x: f64,
        y: f64,
        z: f64,
    }

    #[derive(Deserialize)]
    struct Spot3DDef {
        id: String,
        #[serde(rename = "center3D")]
        center_3d: Coords3D,
    }

    let spots_3d_content =
        std::fs::read_to_string("../web/data/spots_3d.json").expect("Falha ao ler spots_3d.json");
    let spots_3d: Vec<Spot3DDef> =
        serde_json::from_str(&spots_3d_content).expect("Falha no parse do spots_3d.json");

    for spot in spots_3d {
        sqlx::query!(
            r#"
            INSERT INTO spots (id, parking_lot, status, x, y, z, last_updated) 
            VALUES ($1, 'Main', 'free', $2, $3, $4, NOW()) 
            ON CONFLICT (id) DO NOTHING
            "#,
            spot.id,
            spot.center_3d.x,
            spot.center_3d.y,
            spot.center_3d.z
        )
        .execute(&pool)
        .await
        .expect("Falha ao sincronizar vaga com o banco de dados");

        let spot_node = graph.add_node(&spot.id, spot.center_3d.x as f32, spot.center_3d.z as f32);
        
        let mut closest_node_id = None;
        let mut min_dist = f64::MAX;
        
        for (n_id, n_x, n_z) in &config_nodes {
            let dx = n_x - spot.center_3d.x;
            let dz = n_z - spot.center_3d.z;
            let dist = (dx * dx + dz * dz).sqrt();
            if dist < min_dist {
                min_dist = dist;
                if let Some(&g_node) = node_map.get(n_id) {
                    closest_node_id = Some(g_node);
                }
            }
        }
        
        if let Some(closest) = closest_node_id {
            graph.add_edge(closest, spot_node, min_dist.max(1.0) as u32, true);
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
