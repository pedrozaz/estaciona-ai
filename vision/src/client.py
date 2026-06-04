import json
import os
import sys
import time
import asyncio
import websockets
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

os.environ["QT_LOGGING_RULES"] = "*=false"

import cv2
import numpy as np
from ultralytics import YOLO
import torch

WS_URL = os.environ.get("SERVER_WS_URL", "ws://localhost:8000/ws/edge")
WS_URL = WS_URL.replace("ws://server:", "ws://localhost:")
EDGE_API_KEY = os.environ.get("EDGE_API_KEY") or "secret_edge_key"

MODEL_PATH = "yolo26x-seg.pt"
VIDEO_PATH = "data/test_metade.mp4"
SPOTS_PATH = "data/spots.json"

VEHICLE_CLASSES = [2, 7]

TRIGGER_OCCUPIED_THRESHOLD = 0.35
STAY_OCCUPIED_THRESHOLD = 0.20

CONF_THRESHOLD = 0.10
INFERENCE_SIZE = 1312
BOX_SHRINK_FACTOR = 0.15
GAMMA_CORRECTION = 1.4
CLAHE_ENABLED = False


def preprocess_frame(frame, gamma=1.0, clahe_enabled=False) -> np.ndarray:
    processed = frame.copy()
    if gamma != 1.0:
        inv_gamma = 1.0 / gamma
        table = np.array(
            [((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]
        ).astype("uint8")
        processed = cv2.LUT(processed, table)
    if clahe_enabled:
        lab = cv2.cvtColor(processed, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        processed = cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)
    return processed


def load_spots(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def build_spots_masks(
    spots: dict, frame_shape: tuple
) -> dict[str, tuple[np.ndarray, float]]:
    height, width = frame_shape[:2]
    masks = {}

    for spot_id, points in spots.items():
        mask = np.zeros((height, width), dtype=np.uint8)
        polygon = np.array(points, dtype=np.int32)
        cv2.fillPoly(mask, [polygon], 255)
        area = float(cv2.countNonZero(mask))
        masks[spot_id] = (mask, area)

    return masks


def compute_occupancy(
    spot_mask: np.ndarray,
    spot_area: float,
    detections: list[tuple[int, int, int, int]],
    frame_shape: tuple,
) -> float:
    if spot_area == 0:
        return 0.0

    height, width = frame_shape[:2]
    vehicles_mask = np.zeros((height, width), dtype=np.uint8)

    for x1, y1, x2, y2 in detections:
        cv2.rectangle(vehicles_mask, (x1, y1), (x2, y2), 255, -1)

    overlap = cv2.bitwise_and(spot_mask, vehicles_mask)
    overlap_area = float(cv2.countNonZero(overlap))

    return overlap_area / spot_area


async def main():
    spots_path = sys.argv[1] if len(sys.argv) > 1 else SPOTS_PATH

    headers = {"Authorization": f"Bearer {EDGE_API_KEY}"}
    websocket = await websockets.connect(WS_URL, additional_headers=headers)

    spots = load_spots(spots_path)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\n[VISION DEVICE] Rodando em: {device.upper()}")
    if device == "cpu":
        print(
            "[AVISO] CUDA não está disponível. O modelo rodará no processador (CPU), o que causará engasgos!"
        )

    model = YOLO(MODEL_PATH)
    cap = cv2.VideoCapture(VIDEO_PATH)

    if not cap.isOpened():
        print(f"Error: could not open {VIDEO_PATH}")
        return

    ret, frame = cap.read()
    if not ret:
        print("Error: could not read first frame.")
        return

    spot_masks = build_spots_masks(spots, frame.shape)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    debounce_map = {}

    cv2.namedWindow("Estaciona AI - Vision", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Estaciona AI - Vision", 1280, 720)

    print(f"Loaded {len(spots)} parking spots from {spots_path}")

    prev_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("End of video.")
            break

        inference_frame = preprocess_frame(
            frame, gamma=GAMMA_CORRECTION, clahe_enabled=CLAHE_ENABLED
        )

        results = model.predict(
            inference_frame,
            classes=VEHICLE_CLASSES,
            conf=CONF_THRESHOLD,
            imgsz=INFERENCE_SIZE,
            device=device,
            half=(device == "cuda"),
            verbose=False,
        )

        detections: list[tuple[int, int, int, int]] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes.xyxy:
                x1, y1, x2, y2 = int(box[0]), int(box[1]), int(box[2]), int(box[3])

                w = x2 - x1
                h = y2 - y1
                shrink_w = int(w * BOX_SHRINK_FACTOR)
                shrink_h = int(h * BOX_SHRINK_FACTOR)

                sx1 = x1 + shrink_w
                sy1 = y1 + shrink_h
                sx2 = x2 - shrink_w
                sy2 = y2 - shrink_h

                detections.append((sx1, sy1, sx2, sy2))

        for spot_id, (mask, area) in spot_masks.items():
            ratio = compute_occupancy(mask, area, detections, frame.shape)

            if (
                spot_id in debounce_map
                and debounce_map[spot_id]["confirmed"] == "occupied"
            ):
                is_occupied = ratio >= STAY_OCCUPIED_THRESHOLD
            else:
                is_occupied = ratio >= TRIGGER_OCCUPIED_THRESHOLD

            raw_status = "occupied" if is_occupied else "free"

            if spot_id not in debounce_map:
                debounce_map[spot_id] = {
                    "confirmed": raw_status,
                    "candidate": raw_status,
                    "consecutive_frames": 0,
                    "last_change_time": time.time(),
                }

                payload = {
                    "type": "SPOT_UPDATE",
                    "spot_id": spot_id,
                    "status": raw_status,
                    "camera_id": "cam_01",
                    "confidence": float(ratio) if raw_status == "occupied" else 1.0,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                await websocket.send(json.dumps(payload))

            state = debounce_map[spot_id]

            if raw_status == state["confirmed"]:
                state["candidate"] = raw_status
                state["consecutive_frames"] = 0
            else:
                if raw_status == state["candidate"]:
                    state["consecutive_frames"] += 1
                    elapsed_time = time.time() - state["last_change_time"]

                    if raw_status == "occupied":
                        threshold_frames = 2
                        threshold_time = 0.5
                    else:
                        threshold_frames = 5
                        threshold_time = 3.0

                    if state["consecutive_frames"] >= threshold_frames and elapsed_time >= threshold_time:
                        state["confirmed"] = raw_status
                        state["consecutive_frames"] = 0
                        state["last_change_time"] = time.time()

                        payload = {
                            "type": "SPOT_UPDATE",
                            "spot_id": spot_id,
                            "status": raw_status,
                            "camera_id": "cam_01",
                            "confidence": float(ratio)
                            if raw_status == "occupied"
                            else 1.0,
                            "timestamp": time.strftime(
                                "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                            ),
                        }
                        await websocket.send(json.dumps(payload))

                else:
                    state["candidate"] = raw_status
                    state["consecutive_frames"] = 1
                    state["last_change_time"] = time.time()

            is_confirmed_occupied = state["confirmed"] == "occupied"
            color = (0, 0, 255) if is_confirmed_occupied else (0, 255, 0)

            status = f"{ratio:.0%}"

            polygon = np.array(spots[spot_id], dtype=np.int32)
            cv2.polylines(frame, [polygon], isClosed=True, color=color, thickness=2)
            cv2.putText(
                frame,
                f"{spot_id} {status}",
                polygon[0],
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )

        for x1, y1, x2, y2 in detections:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)

        curr_time = time.time()
        time_diff = curr_time - prev_time
        fps = 1.0 / time_diff if time_diff > 0 else 0.0
        prev_time = curr_time
        cv2.putText(
            frame,
            f"FPS: {fps:.1f}",
            (20, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (0, 255, 255),
            2,
        )

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

        await asyncio.sleep(0.01)

    cap.release()
    cv2.destroyAllWindows()
    await websocket.close()


if __name__ == "__main__":
    asyncio.run(main())
