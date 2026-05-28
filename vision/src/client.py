import json
import os
import sys
import time

os.environ["QT_LOGGING_RULES"] = "*=false"

import cv2
import numpy as np
from ultralytics import YOLO

MODEL_PATH = "yolov8m-seg.pt"
VIDEO_PATH = "data/test.mp4"
SPOTS_PATH = "data/spots.json"

# COCO CLASSES = <2,car>,<3,motorcycle>
VEHICLE_CLASSES = [2, 3, 5, 7]

OCCUPANCY_THRESHOLD = 0.5


def load_spots(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def build_spots_masks(
    spots: dict,
    frame_shape: tuple,
) -> dict[str, tuple[np.ndarray, float]]:
    """
    Convert polygon points to binary masks and precompute their areas.
    """
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
    """Return the fraction of the spot covered by any detected vehicle."""
    if spot_area == 0:
        return 0.0

    height, width = frame_shape[:2]
    vehicles_mask = np.zeros((height, width), dtype=np.uint8)

    for x1, y1, x2, y2 in detections:
        cv2.rectangle(vehicles_mask, (x1, y1), (x2, y2), 255, -1)

    overlap = cv2.bitwise_and(spot_mask, vehicles_mask)
    overlap_area = float(cv2.countNonZero(overlap))

    return overlap_area / spot_area


def main():
    spots_path = sys.argv[1] if len(sys.argv) > 1 else SPOTS_PATH

    spots = load_spots(spots_path)
    model = YOLO(MODEL_PATH)
    cap = cv2.VideoCapture(VIDEO_PATH)

    if not cap.isOpened():
        print(f"Error: could not open {VIDEO_PATH}")
        return

    ret, frame = (
        cap.read()
    )  # Build masks based on the first frame to get correct dimensions
    if not ret:
        print("Error: could not read first frame.")
        return

    spot_masks = build_spots_masks(spots, frame.shape)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # Reset to first frame

    print(f"Loaded {len(spots)} parking spots from {spots_path}")

    debounce_map = {}

    while True:
        ret, frame = cap.read()
        if not ret:
            print("End of video.")
            break

        results = model.predict(
            frame, classes=VEHICLE_CLASSES, verbose=False
        )  # Detect vehicles

        detections: list[tuple[int, int, int, int]] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes.xyxy:
                x1, y1, x2, y2 = box
                detections.append((int(x1), int(y1), int(x2), int(y2)))

        for spot_id, (mask, area) in spot_masks.items():
            ratio = compute_occupancy(mask, area, detections, frame.shape)
            is_occupied = ratio >= OCCUPANCY_THRESHOLD

            raw_status = "occupied" if is_occupied else "free"

            if spot_id not in debounce_map:
                debounce_map[spot_id] = {
                    "confirmed": raw_status,
                    "candidate": raw_status,
                    "consective_frames": 0,
                    "last_change_time": time.time(),
                }

            state = debounce_map[spot_id]

            if raw_status == state["confirmed"]:
                state["candidate"] = raw_status
                state["consective_frames"] = 0
            else:
                if raw_status == state["candidate"]:
                    state["consective_frames"] += 1
                    elapsed_time = time.time() - state["last_change_time"]

                    if state["consecutive_frames"] >= 3 or elapsed_time >= 2.0:
                        old_status = state["confirmed"]
                        state["confirmed"] = raw_status
                        state["consecutive_frames"] = 0
                        state["last_change_time"] = time.time()

                        print(
                            f"[{spot_id}] Estado alterado de {old_status} para -> {raw_status}"
                        )

                else:
                    state["candidate"] = raw_status
                    state["consecutive_frames"] = 1
                    state["last_change_time"] = time.time()

            confirmed_occupied = state["confirmed"] == "occupied"
            color = (0, 0, 255) if confirmed_occupied else (0, 255, 0)
            status = f"{ratio:.0%}"

            is_unstable = state["candidate"] != state["confirmed"]
            label_suffix = " (Unstable)" if is_unstable else ""

            polygon = np.array(spots[spot_id], dtype=np.int32)
            cv2.polylines(frame, [polygon], True, color, 2)
            cv2.putText(
                frame,
                f"{spot_id} {status}{label_suffix}",
                tuple(polygon[0]),
                cv2.FONT_HERSHEY_COMPLEX,
                0.5,
                color,
                2,
            )

        for x1, y1, x2, y2 in detections:
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
