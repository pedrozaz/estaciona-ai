import heapq
import math
from typing import Dict, List, Tuple, Optional

class ParkingGraph:
    def __init__(self):
        # node_id -> (x, y)
        self.nodes: Dict[str, Tuple[float, float]] = {}
        # node_id -> dict of {neighbor_id: weight}
        self.edges: Dict[str, Dict[str, float]] = {} 

    def add_node(self, node_id: str, x: float, y: float):
        self.nodes[node_id] = (x, y)
        if node_id not in self.edges:
            self.edges[node_id] = {} 

    def add_edge(self, from_id: str, to_id: str, bidirectional: bool = True):
        """
        Adds an edge calculating the Euclidean distance as weight.
        """ 
        if from_id not in self.nodes or to_id not in self.nodes:
            raise ValueError("Nodes must be added before edges.")

            x1, y1 = self.nodes[from_id]
            x2, y2 = self.nodes[to_id]
            distance = math.sqrt((x2 - x1)** 2 + (y2 - y1)**2)

            self.edges[from_id][to_id] = distance
            if bidirectional:
                self.edges[to_id][from_id] = distance

    def _heuristic(self, node_a: str, node_b: str) -> float:
        """Calculates the heuristic (for A*) between two nodes."""
        x1, y1 = self.nodes[node_a]
        x2, y2 = self.nodes[node_b]
        return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)