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
    
    