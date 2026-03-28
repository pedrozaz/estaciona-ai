import asyncio
import logging
import cv2
from ultralytics import YOLO
from websockets import connect
from websockets.exceptions import ConnectionClosedError
from pydantic import BaseModel
from typing import Dict, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vision_client")


SERVER_WS_URL = "ws://localhost:8000/ws/edge"
MODEL_PATH = "yolo26n.pt"



class SpotUpdate(BaseModel):
    type: str = "SPOT_UPDATE"
    spot_id: str
    status: str


# Configuração das coordenadas das vagas (ID -> [x1, y1, x2, y2])
PARKING_SPOTS: Dict[str, Tuple[int, int, int, int]] = {
    "A-01": (100, 100, 300, 300),
    "A-02": (350, 100, 550, 300),
}


def check_overlap(box1: Tuple[int, int, int, int], box2: Tuple[int, int, int, int]) -> bool:
    # Verify overlap between two boxes
    x1_1, y1_1, x2_1, y2_1 = box1
    x1_2, y1_2, x2_2, y2_2 = box2

    if x1_1 > x2_2 or x2_1 < x1_2: return False
    if y1_1 > y2_2 or y2_1 < y1_2: return False
    return True


async def process_video(websocket):
    model = YOLO(MODEL_PATH)
    video_path = "data/test.mp4"

    # 0 for local camera. Substitute with video or RTSP URL if needed
    cap = cv2.VideoCapture(video_path)


    current_state = {spot_id: "free" for spot_id in PARKING_SPOTS}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            logger.warning("Failed reading frame or video ended.")
            break

        # COCO classes: (2: car, 3: motorcycle)
        results = model.predict(frame, classes=[2, 3], verbose=False)
        detected_boxes = []

        for result in results:
            for box in result.boxes.xyxy:
                detected_boxes.append([int(coord) for coord in box])

        for spot_id, spot_coords in PARKING_SPOTS.items():
            is_occupied = any(check_overlap(spot_coords, det_box) for det_box in detected_boxes)
            new_status = "occupied" if is_occupied else "free"


            if current_state[spot_id] != new_status:
                current_state[spot_id] = new_status
                update = SpotUpdate(spot_id=spot_id, status=new_status)
                await websocket.send(update.model_dump_json())
                logger.info(f"State changed: {update.model_dump_json()}")

            
            color = (0, 0, 255) if current_state[spot_id] == "ocuppied" else (0, 255, 0)
            cv2.rectangle(frame, (spot_coords[0], spot_coords[1]), (spot_coords[2], spot_coords[3]), color, 2)
            cv2.putText(frame, spot_id, (spot_coords[0], spot_coords[1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        for det_box in detected_boxes:
            cv2.rectangle(frame, (det_box[0], det_box[1]), (det_box[2], det_box[3]), (255, 0, 0), 2)

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

        await asyncio.sleep(0.1)

    cap.release()
    cv2.destroyAllWindows()


async def main_loop():
    while True:
        try:
            logger.info(f"Connecting to {SERVER_WS_URL}...")
            async with connect(SERVER_WS_URL) as websocket:
                logger.info("Connected. Starting YOLOv26n inference.")
                await process_video(websocket)
        except (ConnectionClosedError, OSError) as e:
            logger.error(f"Connection error: {e}. Retrying in 3s...")
            await asyncio.sleep(3)

    
if __name__ == "__main__":
    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        logger.info("Vision client stopped.")