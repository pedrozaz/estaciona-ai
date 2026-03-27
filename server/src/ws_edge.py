from fastapi import WebSocketDisconnect
from pydantic import ValidationError
from models import SpotUpdateServer
from models import SpotUpdateEdge
from state import ParkingState
from fastapi import APIRouter

router = APIRouter()
parking_state = ParkingState()

@router.websocket('ws/edge')
async def websocket_edge_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)

                if payload.get('type') == 'SPOT_UPDATE':
                    update_edge = SpotUpdateEdge(**payload)
                    changed = await parking_state.process_spot_update(update_edge)

                    if changed:
                        # Get the final status from the state (can be "free", "occupied", "reserved")
                        final_status = parking_state._spots.get(update_edge.spot_id)
                        update_server = SpotUpdateServer(
                            spot_id=update_edge.spot_id,
                            status=final_status
                        )
                        await manager.broadcast_spot_update(update_server)

            except (ValidationError, json.JSONDecodeError):
                await websocket.send_json({"error": "Invalid payload format"})

    except WebSocketDisconnect:
        print("Edge module disconnected")
                     

