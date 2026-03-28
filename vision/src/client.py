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
   "A-01": (31, 513, 112, 560),
   "A-02": (67, 469, 126, 504),
   "A-03": (142, 468, 226, 498),
   "A-04": (134, 512, 227, 550),
   "A-05": (231, 465, 319, 495),
   "A-06": (236, 507, 339, 547),
   "A-07": (320, 462, 414, 490),
   "A-08": (342, 504, 445, 544),
   "A-09": (421, 460, 480, 486),
   "A-10": (452, 501, 547, 546),
   "A-11": (503, 450, 587, 480),
   "A-12": (547, 497, 658, 535),
   "A-13": (595, 448, 667, 474),
   "A-14": (647, 486, 743, 522),
   "A-15": (757, 477, 831, 517),
   "A-16": (703, 440, 745, 458),
   "A-17": (781, 438, 812, 454),
   "A-18": (847, 474, 929, 509),
   "A-19": (834, 426, 907, 453),
   "A-20": (929, 471, 1012, 504),
   "A-21": (994, 459, 1077, 488),
   "A-22": (924, 410, 984, 450),
   "A-23": (9, 664, 42, 720),
   "A-24": (112, 673, 220, 720),
   "A-25": (255, 673, 392, 720),
   "A-26": (410, 664, 555, 720),
   "A-27": (563, 645, 699, 720),
   "A-28": (719, 629, 876, 719),
   "A-29": (861, 609, 984, 710),
   "A-30": (1002, 608, 1139, 676),
   "A-31": (1114, 576, 1247, 650),
   "A-32": (29, 409, 78, 431),
   "A-33": (98, 405, 149, 434),
   "A-34": (169, 407, 219, 430),
   "A-35": (237, 404, 288, 427),
   "A-36": (306, 403, 370, 423),
   "A-37": (376, 400, 441, 422),
   "A-38": (445, 398, 509, 415),
   "A-39": (513, 391, 578, 416),
   "A-40": (582, 389, 639, 409),
   "A-41": (647, 388, 696, 405),
   "A-42": (712, 385, 772, 407),
   "A-43": (770, 378, 823, 399),
   "A-44": (1112, 414, 1166, 433),
   "A-45": (1233, 442, 1278, 466),
   "A-46": (947, 375, 993, 394),
   "A-47": (821, 343, 885, 364),
   "A-48": (593, 355, 632, 373),
   "A-49": (539, 363, 584, 376),
   "A-50": (479, 366, 518, 378),
   "A-51": (413, 367, 471, 384),
   "A-52": (57, 387, 93, 401),
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