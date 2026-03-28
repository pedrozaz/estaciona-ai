from multiprocessing import freeze_support
import collections
import cv2
import asyncio
import logging
import numpy as np
from ultralytics import YOLO
from websockets import connect
from websockets.exceptions import ConnectionClosedError
from pydantic import BaseModel
from typing import Dict, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vision_client")


SERVER_WS_URL = "ws://localhost:8000/ws/edge"
MODEL_PATH = "yolo26x.pt"
VIDEO_PATH = "data/test2.mp4"

class SpotUpdate(BaseModel):
    type: str = "SPOT_UPDATE"
    spot_id: str
    status: str


# Configuração das coordenadas das vagas (ID -> [x1, y1, x2, y2])
PARKING_SPOTS: Dict[str, Tuple[int, int, int, int]] = {
    "A-01": [(250, 512), (251, 549), (316, 542), (309, 514)],
    "A-02": [(353, 508), (362, 546), (408, 537), (404, 507)],
    "A-03": [(454, 505), (494, 544), (536, 533), (510, 498)],
    "A-04": [(574, 503), (587, 533), (640, 528), (616, 500)],
    "A-05": [(665, 494), (693, 521), (737, 513), (699, 488)],
    "A-06": [(762, 486), (800, 511), (828, 505), (789, 483)],
    "A-07": [(854, 478), (886, 501), (913, 495), (877, 479)],
    "A-08": [(941, 478), (980, 497), (971, 479), (999, 493)],
    "A-09": [(151, 512), (148, 540), (201, 543), (203, 520)],
    "A-10": [(39, 525), (35, 544), (80, 553), (94, 526)],
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

    # 0 for local camera. Substitute with video or RTSP URL if needed
    cap = cv2.VideoCapture(VIDEO_PATH)

    current_state = {spot_id: "free" for spot_id in PARKING_SPOTS}
    free_counters = {spot_id: 0 for spot_id in PARKING_SPOTS}

    spot_history = {spot_id: collections.deque(["free"] * 20, maxlen=20) for spot_id in PARKING_SPOTS}

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            logger.warning("Video ended. Restarting...")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        # COCO classes: (2: car, 3: motorcycle)
        results = model.predict(frame, classes=[2, 3], verbose=False)
        detected_boxes = []

        for result in results:
            for box in result.boxes.xyxy:
                detected_boxes.append([int(coord) for coord in box])

        for spot_id, spot_coords in PARKING_SPOTS.items():
            spot_polygon = np.array(spot_coords, dtype=np.int32)

            is_currently_occupied = False
            for det_box in detected_boxes:
                det_polygon = np.array([
                    [det_box[0], det_box[1]],
                    [det_box[2], det_box[1]],
                    [det_box[2], det_box[3]],
                    [det_box[0], det_box[3]]
                ], dtype=np.int32)

                intersection, _ = cv2.intersectConvexConvex(
                    spot_polygon.astype(np.float32),
                    det_polygon.astype(np.float32)
                )
                if intersection > 0:
                    is_currently_occupied = True
                    break

            if is_currently_occupied:
                free_counters[spot_id] = 0
                smoothed_status = "occupied"
            else:
                free_counters[spot_id] += 1
                if free_counters[spot_id] > 10:
                    smoothed_status = "free"
                else:
                    smoothed_status = current_state[spot_id]

            if current_state[spot_id] != smoothed_status:
                current_state[spot_id] = smoothed_status
                update = SpotUpdate(spot_id=spot_id, status=smoothed_status)
                await websocket.send(update.model_dump_json())
                logger.info(f"State stabilized and changed: {update.model_dump_json()}")

            color = (0, 0, 255) if current_state[spot_id] == "occupied" else (0, 255, 0)
            cv2.polylines(frame, [spot_polygon], isClosed=True, color=color, thickness=2)
            cv2.putText(frame, spot_id, spot_coords[0], cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        for det_box in detected_boxes:
            cv2.rectangle(frame, (det_box[0], det_box[1]), (det_box[2], det_box[3]), (255, 0, 0), 2)

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

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