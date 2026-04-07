use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(pub usize);

#[derive(Debug, Clone)]
pub struct Node {
    pub name: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
pub struct Edge {
    pub target: NodeId,
    pub cost: u32,
    pub active: bool,
}

#[derive(Copy, Clone, Eq, PartialEq)]
struct State {
    cost: u32,
    node: NodeId,
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost)
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct ParkingGraph {
    nodes: HashMap<NodeId, Node>,
    edges: HashMap<NodeId, Vec<Edge>>,
    name_to_id: HashMap<String, NodeId>,
    next_id: usize,
}

impl ParkingGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: HashMap::new(),
            name_to_id: HashMap::new(),
            next_id: 0,
        }
    }

    pub fn add_node(&mut self, name: &str, x: f32, y: f32) -> NodeId {
        let id = NodeId(self.next_id);
        self.next_id += 1;

        self.nodes.insert(
            id,
            Node {
                name: name.to_string(),
                x,
                y,
            },
        );
        self.name_to_id.insert(name.to_string(), id);
        self.edges.insert(id, Vec::new());

        id
    }

    pub fn add_edge(&mut self, from: NodeId, to: NodeId, cost: u32, bidirectional: bool) {
        if let Some(neighbors) = self.edges.get_mut(&from) {
            neighbors.push(Edge {
                target: to,
                cost,
                active: true,
            });
        }
        if bidirectional && let Some(neighbors) = self.edges.get_mut(&to) {
            neighbors.push(Edge {
                target: from,
                cost,
                active: true,
            });
        }
    }

    pub fn set_edge_status(&mut self, from: &str, to: &str, active: bool) {
        let from_id = self.name_to_id.get(from).copied();
        let to_id = self.name_to_id.get(to).copied();

        if let (Some(f_id), Some(t_id)) = (from_id, to_id) {
            if let Some(neighbors) = self.edges.get_mut(&f_id) {
                for edge in neighbors.iter_mut() {
                    if edge.target == t_id {
                        edge.active = active;
                    }
                }
            }
            if let Some(neighbors) = self.edges.get_mut(&t_id) {
                for edge in neighbors.iter_mut() {
                    if edge.target == f_id {
                        edge.active = active;
                    }
                }
            }
        }
    }

    fn heuristic(&self, a: NodeId, b: NodeId) -> u32 {
        let node_a = self.nodes.get(&a).unwrap();
        let node_b = self.nodes.get(&b).unwrap();

        let dx = node_a.x - node_b.x;
        let dy = node_a.y - node_b.y;
        ((dx * dx + dy * dy).sqrt() * 10.0) as u32
    }

    pub fn calculate_route(&self, start_name: &str, end_name: &str) -> Option<Vec<String>> {
        let start = *self.name_to_id.get(start_name)?;
        let goal = *self.name_to_id.get(end_name)?;

        let mut frontier = BinaryHeap::new();
        frontier.push(State {
            cost: 0,
            node: start,
        });

        let mut came_from: HashMap<NodeId, Option<NodeId>> = HashMap::new();
        let mut cost_so_far: HashMap<NodeId, u32> = HashMap::new();

        came_from.insert(start, None);
        cost_so_far.insert(start, 0);

        while let Some(State { node: current, .. }) = frontier.pop() {
            if current == goal {
                break;
            }

            if let Some(neighbors) = self.edges.get(&current) {
                for edge in neighbors {
                    // Impede o algoritmo de atravessar arestas bloqueadas
                    if !edge.active {
                        continue;
                    }

                    let next = edge.target;
                    let new_cost = cost_so_far.get(&current).unwrap_or(&0) + edge.cost;

                    if !cost_so_far.contains_key(&next)
                        || new_cost < *cost_so_far.get(&next).unwrap()
                    {
                        cost_so_far.insert(next, new_cost);
                        let priority = new_cost + self.heuristic(next, goal);

                        frontier.push(State {
                            cost: priority,
                            node: next,
                        });
                        came_from.insert(next, Some(current));
                    }
                }
            }
        }

        let mut current = goal;
        let mut path_ids = vec![current];

        while let Some(Some(prev)) = came_from.get(&current) {
            current = *prev;
            path_ids.push(current);
        }

        if current != start {
            return None;
        }

        path_ids.reverse();

        Some(
            path_ids
                .into_iter()
                .map(|id| self.nodes.get(&id).unwrap().name.clone())
                .collect(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_graph() -> ParkingGraph {
        let mut graph = ParkingGraph::new();

        let in_node = graph.add_node("entrada", 0.0, 0.0);
        let mid1_node = graph.add_node("meio-1", 1.0, 0.0);
        let mid2_node = graph.add_node("meio-2", 1.0, 1.0);
        let park_node = graph.add_node("vaga-1", 2.0, 0.0);

        graph.add_edge(in_node, mid1_node, 10, true);
        graph.add_edge(in_node, mid2_node, 15, true);
        graph.add_edge(mid1_node, park_node, 10, true);
        graph.add_edge(mid2_node, park_node, 15, true);

        graph
    }

    #[test]
    fn route_avoids_blocked_edge() {
        let mut graph = build_test_graph();

        let route1 = graph.calculate_route("entrada", "vaga-1").unwrap();
        assert_eq!(route1, vec!["entrada", "meio-1", "vaga-1"]);

        graph.set_edge_status("entrada", "meio-1", false);

        let route2 = graph.calculate_route("entrada", "vaga-1").unwrap();
        assert_eq!(route2, vec!["entrada", "meio-2", "vaga-1"]);
    }

    #[test]
    fn no_route_if_all_blocked() {
        let mut graph = build_test_graph();

        graph.set_edge_status("entrada", "meio-1", false);
        graph.set_edge_status("entrada", "meio-2", false);

        let route = graph.calculate_route("entrada", "vaga-1");
        assert!(route.is_none());
    }
}
