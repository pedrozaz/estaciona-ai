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

    def find_shortest_path(self, start_id: str, goal_id: str) -> Optional[List[str]]:
        if start_id not in self.nodes or goal_id not in self.nodes:
            return None

        # Priority queue: (f_score, current_node)
        open_set = []
        heapq.heappush(open_set, (0, start_id))

        # Track the path
        came_from: Dict[str, str] = {}

        # Cost from start to node
        g_score: Dict[str, float] = {node: float('inf') for node in self.nodes}
        g_score[start_id] = 0

        # Estimated total cost from start to goal through node (g_score + heuristic)
        f_score: Dict[str, float] = {node: float('inf') for node in self.nodes}
        f_score[start_id] = self._heuristic(start_id, goal_id)

        while open_set:
            _, current = heapq.heappop(open_set)

            if current == goal_id:
                # Reconstruct path
                path = [current]
                while current in came_from:
                    current = came_from[current]
                    path.append(current)
                return path[::-1] # Return reversed path

            for neighbor, weight in self.edges.get(current, {}).items():
                tentative_g_score = g_score[current] + weight

                if tentative_g_score < g_score[neighbor]:
                    # Found a better path
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g_score
                    f_score[neighbor] = tentative_g_score + self._heuristic(neighbor, goal_id)
                    
                    # Add to queue if not already there
                    if not any(neighbor == item[1] for item in open_set):
                        heapq.heappush(open_set, (f_score[neighbor], neighbor))

        return None # No path found
                    
                
                
        
        
        