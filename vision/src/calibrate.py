import cv2

WINDOW_NAME = "Calibrate spots (ESC for exit)"

points = []
spots = []
frame_copy = None

def click_event(event, x, y, flags, params):
    global points, spots, frame_copy
    if event == cv2.EVENT_LBUTTONDOWN:
        points.append((x, y))
        cv2.circle(frame_copy, (x, y), 3, (0, 0, 255), -1)
        if len(points) > 1:
            cv2.line(frame_copy, points[-2], points[-1], (0, 255, 0), 2)
        if len(points) == 4:
            cv2.line(frame_copy, points[3], points[0], (0, 255, 0), 2)
            spots.append(list(points))
            points = []
            print(f"Spot {len(spots)} registered.")
        cv2.imshow(WINDOW_NAME, frame_copy)

def calibrate_spots():
    global frame_copy
    video_path = "data/test.mp4"
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("Error reading video")
        return

    frame_copy = frame.copy()
    cv2.imshow(WINDOW_NAME, frame_copy)
    cv2.setMouseCallback(WINDOW_NAME, click_event)

    print("Click on the 4 corners of each spot")

    while True:
        if cv2.waitKey(1) & 0xFF == 27:
            break

    cv2.destroyAllWindows()

    print("\nPARKING_SPOTS: dict = {")
    for i, spot in enumerate(spots):
        spot_id = f"A-{i+1:02d}"
        print(f'    "{spot_id}": {spot},')
    print("}")

if __name__ == "__main__":
    calibrate_spots()