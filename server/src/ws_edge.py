import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from .models import SpotUpdateServer, SpotUpdateEdge
from .dependencies import parking_state
from .ws_app import manager

router = APIRouter()

@router.websocket('/ws/edge')
async def websocket_edge_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)

                if payload.get('type') == 'SPOT_UPDATE':
                    update_edge = SpotUpdateEdge(**payload)
                    new_status = await parking_state.process_spot_update(update_edge)

                    if new_status is not None:
                        update_server = SpotUpdateServer(
                            spot_id=update_edge.spot_id,
                            status=new_status
                        )
                        await manager.broadcast_spot_update(update_server)

            except (ValidationError, json.JSONDecodeError):
                await websocket.send_json({"error": "Invalid payload format"})

    except WebSocketDisconnect:
        print("Edge module disconnected")
