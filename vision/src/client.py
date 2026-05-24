import cv2

VIDEO_PATH = "data/test.mp4"


def main():
    cap = cv2.VideoCapture(VIDEO_PATH)

    if not cap.isOpened():
        print(f"Error: could not open {VIDEO_PATH}")
        return

    while True:
        ret, frame = cap.read()

        if not ret:
            print("End of video.")
            break

        cv2.imshow("Estaciona AI - Vision", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
