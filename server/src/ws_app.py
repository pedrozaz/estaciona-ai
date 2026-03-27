from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import json
from .models import SpotUpdateServer

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast_spot_update(self, update: SpotUpdateServer):
        payload = update.model_dump_json()
        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                pass

manager = ConnectionManager()

@router.WebSocket('ws/app')
async def websocket_app_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # The app doesn't send messages, it just listens for updates
            # We maintain the loop open to keep the connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
            
    


        