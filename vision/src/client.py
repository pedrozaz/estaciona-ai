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
    "A-01": [(375, 513), (380, 530), (403, 530), (402, 514)],
    "A-02": [(271, 519), (273, 535), (293, 531), (290, 519)],
    "A-03": [(160, 519), (158, 533), (183, 534), (188, 519)],
    "A-04": [(51, 527), (51, 542), (83, 542), (88, 523)],
    "A-05": [(138, 691), (140, 713), (192, 715), (187, 691)],
    "A-06": [(296, 690), (303, 714), (350, 710), (334, 685)],
    "A-07": [(469, 690), (478, 714), (526, 712), (511, 689)],
    "A-08": [(609, 677), (630, 702), (663, 700), (644, 678)],
    "A-09": [(763, 658), (797, 687), (842, 683), (802, 659)],
    "A-10": [(914, 652), (954, 671), (964, 657), (928, 646)],
    "A-11": [(1039, 630), (1063, 648), (1090, 635), (1056, 626)],
    "A-12": [(1173, 615), (1191, 628), (1219, 626), (1199, 610)],
    "A-13": [(1025, 469), (1047, 481), (1048, 465), (1034, 465)],
    "A-14": [(956, 484), (975, 493), (983, 485), (968, 482)],
    "A-15": [(857, 481), (867, 489), (885, 496), (892, 488)],
    "A-16": [(773, 490), (792, 505), (815, 501), (806, 490)],
    "A-17": [(674, 496), (689, 510), (709, 505), (706, 494)],
    "A-18": [(580, 507), (594, 520), (610, 512), (606, 506)],
    "A-19": [(472, 508), (482, 522), (507, 521), (505, 508)],
}

def poly_to_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)

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
            bbox = poly_to_bbox(spot_coords)
            is_occupied = any(check_overlap(bbox, det_box) for det_box in detected_boxes)
            new_status = "occupied" if is_occupied else "free"

            if current_state[spot_id] != new_status:
                current_state[spot_id] = new_status
                update = SpotUpdate(spot_id=spot_id, status=new_status)
                await websocket.send(update.model_dump_json())
                logger.info(f"State changed: {update.model_dump_json()}")

            color = (0, 0, 255) if current_state[spot_id] == "occupied" else (0, 255, 0)
            pts = [list(p) for p in spot_coords]
            cv2.polylines(frame, [__import__('numpy').array(pts, dtype='int32')], True, color, 2)
            cv2.putText(frame, spot_id, spot_coords[0], cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

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