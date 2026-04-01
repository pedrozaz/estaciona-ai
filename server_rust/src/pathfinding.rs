use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

#[derive(Copy, Clone, Eq, PartialEq)]
struct State {
    cost: i32,
    node: Point,
}

impl Ord for State {
    fn cmp(&self, other: &Self) -> Ordering {
        other.cost.cmp(&self.cost)
            .then_with(|| self.node.x.cmp(&other.node.x))
            .then_with(|| self.node.y.cmp(&other.node.y))
    }
}

impl PartialOrd for State {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

pub struct ParkingGraph {
    pub locations: HashMap<String, Point>,
    pub obstacles: Vec<Point>,
}

impl ParkingGraph {
    pub fn new() -> Self {
        let mut locations = HashMap::new();

        // Stub: coordenadas de exemplo
        locations.insert("cam-entrada".to_string(), Point { x: 0, y: 0 });
        locations.insert("corredor-A".to_string(), Point { x: 5, y: 0 });
        locations.insert("A-01".to_string(), Point { x: 5, y: 5 });
        locations.insert("A-02".to_string(), Point { x: 5, y: 6 });

        Self {
            locations,
            obstacles: vec![],
        }
    }

    fn heuristic(a: &Point, b: &Point) -> i32 {
        (a.x - b.x).abs() + (a.y - b.y).abs()
    }

    fn get_neighbors(&self, p: &Point) -> Vec<Point> {
        let dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)];
        dirs.iter()
            .map(|(dx, dy)| Point { x: p.x + dx, y: p.y + dy })
            .filter(|np| !self.obstacles.contains(np)) 
            .collect()
    }

    // Algoritmo A* principal
    pub fn calculate_route(&self, start_id: &str, end_id: &str) -> Option<Vec<String>> {
        let start = self.locations.get(start_id)?;
        let goal = self.locations.get(end_id)?;

        let mut frontier = BinaryHeap::new();
        frontier.push(State { cost: 0, node: *start });

        let mut came_from: HashMap<Point, Option<Point>> = HashMap::new();
        let mut cost_so_far: HashMap<Point, i32> = HashMap::new();

        came_from.insert(*start, None);
        cost_so_far.insert(*start, 0);

        while let Some(State { node: current, .. }) = frontier.pop() {
            if current == *goal {
                break;
            }

            for next in self.get_neighbors(&current) {
                let new_cost = cost_so_far.get(&current).unwrap_or(&0) + 1;

                if !cost_so_far.contains_key(&next) || new_cost < *cost_so_far.get(&next).unwrap() {
                    cost_so_far.insert(next, new_cost);
                    let priority = new_cost + Self::heuristic(&next, goal);
                    frontier.push(State { cost: priority, node: next });
                    came_from.insert(next, Some(current));
                }
            }
        }

        let mut current = *goal;
        let mut path_points = vec![current];
        
        while let Some(Some(prev)) = came_from.get(&current) {
            current = *prev;
            path_points.push(current);
        }

        if current != *start {
            return None;
        }

        path_points.reverse();

        // Converte as coordenadas de volta para os IDs textuais ("corredor-A", etc)
        // Nota: Esta é uma simplificação. Na prática, precisaremos de um mapeamento reverso.
        let mut route_ids = vec![];
        for pt in path_points {
            if let Some((id, _)) = self.locations.iter().find(|&(_, &p)| p == pt) {
                route_ids.push(id.clone());
            }
        }

        Some(route_ids)
    }
}