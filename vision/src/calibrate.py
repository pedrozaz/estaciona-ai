import cv2

def calibrate_spots():
    video_path = "data/test.mp4"
    cap = cv2.VideoCapture(video_path)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        print("Error while reading video frame for calibration.")
        return
    
    print("--- INSTRUCTIONS ---")
    print("1. Clich and drag to draw a rectangle around a parking lot.")
    print("2. Press SPACE or ENTER to confirm that.")
    print("3. Repeat the process for all parking spots.")
    print("4. Press ESC after selecting all spots.")
    print("--------------------")

    rois = cv2.selectROIs("Calibrate Parking Spots (ESC for exit)", frame, showCrosshair=True, fromCenter=False)
    cv2.destroyAllWindows()

    if len(rois) == 0:
        print("No parking spots selected.")
        return

    print("\n Calibration complete. Copy the following values in your client:\n")
    print("PARKING_SPOTS = Dict[str, Tuple[int, int, int, int]] = {")

    for i, roi in enumerate(rois):
        x, y, w, h = roi
        x1, y1 = x, y
        x2, y2 = x + w, y + h

        spot_id = f"A-{i+1:02d}"
        print(f'   "{spot_id}": ({x1}, {y1}, {x2}, {y2}),')

    print("}")

if __name__ == "__main__":
    calibrate_spots() 
