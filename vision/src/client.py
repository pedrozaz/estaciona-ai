import cv2
from ultralytics import YOLO

MODEL_PATH = "yolo26x.pt"
VIDEO_PATH = "data/test.mp4"

# COCO CLASSES = <2,car>,<3,motorcycle>
VEHICLE_CLASSES = [2, 3]


def main():
    model = YOLO(MODEL_PATH)
    cap = cv2.VideoCapture(VIDEO_PATH)

    if not cap.isOpened():
        print(f"Error: could not open {VIDEO_PATH}")
        return

    while True:
        ret, frame = cap.read()

        if not ret:
            print("End of video.")
            break

        results = model.predict(frame, classes=VEHICLE_CLASSES, verbose=False)

        for result in results:
            if result.boxes is None:
                continue

            for box, conf, cls in zip(
                result.boxes.xyxy,
                result.boxes.conf,
                result.boxes.cls,
            ):
                x1, y1, x2, y2 = [int(c) for c in box]
                label = f"{model.names[int(cls)]} {conf:.2f}"

                cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 0, 0), 2)
                cv2.putText(
                    frame,
                    label,
                    (x1, y1 - 8),
                    cv2.FONT_HERSHEY_COMPLEX,
                    0.5,
                    (255, 0, 0),
                    2,
                )

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
