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
use std::sync::Mutex;
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
    pub edge_api_key: String,
    pub last_trend_prediction: Mutex<Option<String>>,
}

pub type SharedState = Arc<AppState>;

pub async fn init_state(
    pool: PgPool,
    jwt_secret: String,
    plate_pepper: String,
    edge_api_key: String,
) -> SharedState {
    let (tx, _) = broadcast::channel(100);

    let mut graph = ParkingGraph::new();

    #[derive(Deserialize)]
    struct PathNode {
        x: f64,
        z: f64,
    }

    #[derive(Deserialize)]
    struct ParkingLotConfig {
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
            let node_id = if i == 0 {
                "cam-01".to_string()
            } else {
                format!("path_node_{}", i)
            };

            let graph_node = graph.add_node(&node_id, p.x as f32, p.z as f32);
            node_map.insert(node_id.clone(), graph_node);
            config_nodes.push((node_id.clone(), p.x, p.z));

            if let Some(prev_id) = &prev_node_id
                && let (Some(&from_node), Some(&to_node)) =
                    (node_map.get(prev_id), node_map.get(&node_id))
            {
                let prev_p = &parking.path[i - 1];
                let dist =
                    (((p.x - prev_p.x).powi(2) + (p.z - prev_p.z).powi(2)).sqrt() * 1000.0) as u32;
                graph.add_edge(from_node, to_node, dist.max(1), true);
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

        if let Some(parking) = parkings.first()
            && !parking.path.is_empty()
        {
            let nearest = config_nodes
                .iter()
                .filter_map(|(name, x, z)| {
                    let distance =
                        ((x - spot.center_3d.x).powi(2) + (z - spot.center_3d.z).powi(2)).sqrt();
                    node_map.get(name).map(|node| (*node, distance))
                })
                .min_by(|a, b| a.1.total_cmp(&b.1));
            if let Some((closest, distance)) = nearest {
                graph.add_edge(
                    closest,
                    spot_node,
                    ((distance * 1000.0) as u32).max(1),
                    true,
                );
            }
        }
    }

    Arc::new(AppState {
        pool,
        tx,
        user_sessions: DashMap::new(),
        graph: RwLock::new(graph),
        jwt_secret,
        plate_pepper,
        edge_api_key,
        last_trend_prediction: Mutex::new(None),
    })
}
