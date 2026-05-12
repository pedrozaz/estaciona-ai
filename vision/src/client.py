import asyncio
import logging
from websockets import connect
from websockets.exceptions import ConnectionClosedError
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vision_client")

SERVER_WS_URL = "ws://localhost:8000/ws/edge"

class SpotUpdate(BaseModel):
    type: str = "SPOT_UPDATE"
    spot_id: str
    status: str

async def send_updates():
    while True:
        try:
            logger.info(f"Connecting to {SERVER_WS_URL}...")
            async with connect(SERVER_WS_URL) as websocket:
                logger.info("Connected to Central Server.")

                # Detection sent simulation
                while True:
                    await asyncio.sleep(5)
                    update = SpotUpdate(spot_id="A-01", status="occupied")
                    await websocket.send(update.model_dump_json())
                    logger.info(f"Sent update: {update.model_dump_json}")

                    await asyncio.sleep(5)
                    update = SpotUpdate(spot_id="A-01", status="free")
                    await websocket.send(update.model_dump_json())
                    logger.info(f"Sent update: {update.model_dump_json}")

        except (ConnectionClosedError, OSError) as e:
            logger.error(f"Connection lost or failed: {e}. Retrying in 3 seconds...")
            await asyncio.sleep(3)

if __name__ == "__main__":
    try:
        asyncio.run(send_updates())
    except KeyboardInterrupt:
        logger.info("Vision client stopped.")
