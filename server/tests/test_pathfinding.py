import pytest
from src.pathfinding import ParkingGraph

@pytest.fixture
def parking_graph():
    g = ParkingGraph()
    
    # Grid 3x3
    # A(0,0) --- B(1,0) --- C(2,0)
    # |         |         |
    # D(0,1) --- (Obstáculo) --- F(2,1)
    # |         |         |
    # G(0,2) --- H(1,2) --- I(2,2)

    nodes = {
        "A": (0,0), "B": (1,0), "C": (2,0),
        "D": (0,1),             "F": (2,1),
        "G": (0,2), "H": (1,2), "I": (2,2)
    }

    for node_id, (x, y) in nodes.items():
        g.add_node(node_id, x, y)
    
    edges = [
        ("A, B"), ("B, C"),
        ("A, D"), ("C, F"),
        ("D, G"), ("F, I"),
        ("G, H"), ("H, I")
    ]

    for n1, n2 in edges:
        g.add_edge(n1, n2)

    return g

def test_direct_neighbor_path(parking_graph):
    path = parking_graph.find_shortest_path("A", "B")
    assert path == ["A", "B"]


def test_shortest_path_avoids_obstacle(parking_graph):
    path = parking_graph.find_shortest_path("A", "I")

    # O algoritmo vai contornar o centro
    # Caminhos válidos com mesmo peso: ["A", "B", "C", "F", "I"] e ["A", "D", "G", "H", "I"]
    valid_paths = [
        ["A", "B", "C", "F", "I"],
        ["A", "D", "G", "H", "I"]
    ]
    assert path in valid_paths

def test_unreachable_node(parking_graph):
    parking_graph.add_node("ISOLATED", 10, 10)
    path = parking_graph.find_shortest_path("A", "ISOLATED")
    assert path is None

def test_invalid_nodes_return_none(parking_graph):
    path = parking_graph.find_shortest_path("UNKNOWN_1", "UNKNOWN_2")
    assert path is None

    
    