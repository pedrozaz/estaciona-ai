use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(pub usize);

#[derive(Debug, Clone)]
pub struct Node {
    pub id: NodeId,
    pub name: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
pub struct Edge {
    pub target: NodeId,
    pub cost: u32,
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
