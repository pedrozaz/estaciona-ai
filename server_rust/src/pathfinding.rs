use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

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
        other
            .cost
            .cmp(&self.cost)
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
        // Define a bounding box based on all known locations to keep the search space finite.
        // This prevents A* from exploring an infinite grid if the goal is unreachable.
        let mut min_x = i32::MAX;
        let mut max_x = i32::MIN;
        let mut min_y = i32::MAX;
        let mut max_y = i32::MIN;

        for point in self.locations.values() {
            if point.x < min_x {
                min_x = point.x;
            }
            if point.x > max_x {
                max_x = point.x;
            }
            if point.y < min_y {
                min_y = point.y;
            }
            if point.y > max_y {
                max_y = point.y;
            }
        }

        // Add a small padding so paths can route slightly around obstacles
        let padding: i32 = 10;
        min_x -= padding;
        max_x += padding;
        min_y -= padding;
        max_y += padding;

        let dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)];
        dirs.iter()
            .map(|(dx, dy)| Point {
                x: p.x + dx,
                y: p.y + dy,
            })
            .filter(|np| {
                np.x >= min_x
                    && np.x <= max_x
                    && np.y >= min_y
                    && np.y <= max_y
                    && !self.obstacles.contains(np)
            })
            .collect()
    }

    // Algoritmo A* principal
    pub fn calculate_route(&self, start_id: &str, end_id: &str) -> Option<Vec<String>> {
        let start = self.locations.get(start_id)?;
        let goal = self.locations.get(end_id)?;

        let mut frontier = BinaryHeap::new();
        frontier.push(State {
            cost: 0,
            node: *start,
        });

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
                    frontier.push(State {
                        cost: priority,
                        node: next,
                    });
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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_graph() -> ParkingGraph {
        let mut locations = HashMap::new();

        locations.insert("entrada".to_string(), Point { x: 0, y: 0 });
        locations.insert("meio".to_string(), Point { x: 1, y: 0 });
        locations.insert("vaga-1".to_string(), Point { x: 2, y: 0 });
        locations.insert("vaga-2".to_string(), Point { x: 2, y: 2 });

        ParkingGraph {
            locations,
            obstacles: vec![],
        }
    }

    #[test]
    fn test_valid_route() {
        let graph = create_test_graph();
        let route = graph.calculate_route("entrada", "vaga-1");

        assert!(route.is_some());
        let path = route.unwrap();
        assert_eq!(path.first().unwrap(), "entrada");
        assert_eq!(path.last().unwrap(), "vaga-1");
        assert!(path.contains(&"meio".to_string()));
    }

    #[test]
    fn test_obstacle_avoidance() {
        let mut graph = create_test_graph();

        graph.obstacles.push(Point { x: 1, y: 0 });

        let route = graph.calculate_route("entrada", "vaga-1");

        assert!(route.is_some());
        let path = route.unwrap();

        assert!(!path.contains(&"meio".to_string()));
    }

    #[test]
    fn test_unreachable_node() {
        let mut graph = create_test_graph();

        graph.obstacles.push(Point { x: 1, y: 2 });
        graph.obstacles.push(Point { x: 3, y: 2 });
        graph.obstacles.push(Point { x: 2, y: 1 });
        graph.obstacles.push(Point { x: 2, y: 3 });

        let route = graph.calculate_route("entrada", "vaga-isolada");

        assert!(route.is_none());
    }
}
