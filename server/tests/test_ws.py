import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.ws_edge import parking_state
import json

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_state():
    """
    Clears the global state before each test
    """
    parking_state._spots.clear()
    parking_state._locks.clear()
    parking_state._frame_buffer.clear()

def test_spot_update_requires_three_frames():
    with client.websocket_connect("/ws/app") as ws_app:
        with client.websocket_connect("/ws/edge") as ws_edge:
            
            payload = {
                "type": "SPOT_UPDATE",
                "spot_id": "A-01",
                "status": "occupied",
                "camera_id": "cam-1",
                "confidence": 0.9,
                "timestamp": "2026-03-27T19:59:27Z"  
            }

            # Envia frame 1
            ws_edge.send_json(payload)
            # Envia frame 2
            ws_edge.send_json(payload)
            
            # Não deve haver broadcast ainda
            assert parking_state._spots.get("A-01") is None
            
            # Envia frame 3
            ws_edge.send_json(payload)

            # Agora o estado deve mudar e haver um broadcast
            assert parking_state._spots.get("A-01") == "occupied"

            response = ws_app.receive_json()
            assert response["type"] == "SPOT_UPDATE"
            assert response["spot_id"] == "A-01"
            assert response["status"] == "occupied"

def test_spot_update_ignores_low_confidence():
    with client.websocket_connect("/ws/edge") as ws_edge:
        
        payload = {
            "type": "SPOT_UPDATE",
            "spot_id": "A-02",
            "status": "occupied",
            "camera_id": "cam-1",
            "confidence": 0.4, # Baixa confiança
            "timestamp": "2026-03-27T19:59:27Z"
        }

        for _ in range(3):
            ws_edge.send_json(payload)

        # O estado deve continuar vazio
        assert parking_state._spots.get("A-02") is None


