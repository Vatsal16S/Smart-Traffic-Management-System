import cv2
import numpy as np
import time
import os
from ultralytics import YOLO

# =========================================================
# CONFIGURATION
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_PATH = os.path.join(BASE_DIR, "video3.mp4")

print("Video path:", VIDEO_PATH)
print("Exists:", os.path.exists(VIDEO_PATH))

# YOLO model
MODEL_PATH = "yolov10n.pt"

CONFIDENCE = 0.18
IOU = 0.45

# Performance settings
FRAME_SKIP = 2
RESIZE_W = 960
RESIZE_H = 540

# Headlight detection settings
HEADLIGHT_MIN_AREA = 25
HEADLIGHT_MAX_AREA = 1200
HEADLIGHT_THRESHOLD = 235

# COCO vehicle classes
VEHICLE_CLASSES = {
    2: "Car",
    3: "Bike",
    5: "Bus",
    7: "Truck"
}

# Density Capacity
LANE_CAPACITY = 10

# =========================================================
# INTERACTIVE ROI FUNCTION
# =========================================================
roi_pts = []
def draw_roi(event, x, y, flags, param):
    global roi_pts
    if event == cv2.EVENT_LBUTTONDOWN:
        if len(roi_pts) < 4:
            roi_pts.append((x, y))

# =========================================================
# LOAD MODEL
# =========================================================
print("Loading model...")
model = YOLO(MODEL_PATH)

# =========================================================
# OPEN VIDEO
# =========================================================
cap = cv2.VideoCapture(VIDEO_PATH)

if not cap.isOpened():
    raise RuntimeError(f"Cannot open video: {VIDEO_PATH}")

# =========================================================
# INTERACTIVE ROI SELECTION
# =========================================================
ret, first_frame = cap.read()
if not ret:
    raise RuntimeError("Failed to read first frame for ROI selection.")

# Resize first frame so ROI is drawn exactly to the scale used during tracking
first_frame = cv2.resize(first_frame, (RESIZE_W, RESIZE_H))

window_name = 'Select Lane (Click 4 corners, then press ENTER)'
cv2.namedWindow(window_name)
cv2.setMouseCallback(window_name, draw_roi)

print("\n--- ROI SETUP ---")
print("Please click 4 points to define your EXACT lane on the video.")
print("Suggested order: Top-Left, Top-Right, Bottom-Right, Bottom-Left.")
print("Press ENTER when done drawing to start the detection.\n")

while True:
    display_frame = first_frame.copy()
    
    for i, pt in enumerate(roi_pts):
        cv2.circle(display_frame, pt, 5, (0, 0, 255), -1)
        if i > 0:
            cv2.line(display_frame, roi_pts[i-1], pt, (0, 255, 255), 2)
            
    if len(roi_pts) == 4:
        cv2.line(display_frame, roi_pts[3], roi_pts[0], (0, 255, 255), 2)
        cv2.putText(display_frame, 'Press ENTER to confirm!', (20, 50), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
        
    cv2.imshow(window_name, display_frame)
    
    # Enter key to confirm ROI
    if cv2.waitKey(1) == 13 and len(roi_pts) == 4:
        break

cv2.destroyWindow(window_name)

# Define resized ROI directly from clicked points
lane_roi_resized = np.array(roi_pts, dtype=np.int32)
roi_contour = lane_roi_resized.reshape((-1, 1, 2))

# Create Mask for Headlight Detection
roi_mask = np.zeros((RESIZE_H, RESIZE_W), dtype=np.uint8)
cv2.fillPoly(roi_mask, [lane_roi_resized], 255)

# Reset video to start
cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

# =========================================================
# HEADLIGHT DETECTION FUNCTION
# =========================================================
def detect_headlights(frame, roi_mask):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    gray = cv2.bitwise_and(gray, gray, mask=roi_mask)

    _, thresh = cv2.threshold(
        gray,
        HEADLIGHT_THRESHOLD,
        255,
        cv2.THRESH_BINARY
    )

    kernel = np.ones((3, 3), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(
        thresh,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    detections = []

    for cnt in contours:

        area = cv2.contourArea(cnt)

        if area < HEADLIGHT_MIN_AREA or area > HEADLIGHT_MAX_AREA:
            continue

        x, y, w, h = cv2.boundingRect(cnt)

        aspect = w / float(h)

        if aspect < 0.4 or aspect > 2.5:
            continue

        cx = x + w // 2
        cy = y + h // 2

        detections.append((cx, cy, x, y, w, h))

    return detections

# =========================================================
# TRACKING STORAGE
# =========================================================
unique_ids = set()

# =========================================================
# FPS
# =========================================================
prev_time = time.time()
frame_count = 0

print("Starting video... Press ESC to exit.")

# =========================================================
# MAIN LOOP
# =========================================================
while True:

    ret, frame = cap.read()

    if not ret:
        break

    frame_count += 1

    # Skip frames
    if frame_count % FRAME_SKIP != 0:
        continue

    # Resize for speed
    frame = cv2.resize(frame, (RESIZE_W, RESIZE_H))

    # -----------------------------------------------------
    # Night enhancement
    # -----------------------------------------------------
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)

    frame = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

    display = frame.copy()

    # -----------------------------------------------------
    # YOLOv10 tracking
    # -----------------------------------------------------
    results = model.track(
        source=frame,
        persist=True,
        tracker="bytetrack.yaml",
        conf=CONFIDENCE,
        iou=IOU,
        classes=[2, 3, 5, 7],
        imgsz=640,
        verbose=False
    )

    # Darken outside ROI
    dark = (display * 0.25).astype(np.uint8)
    mask3 = cv2.cvtColor(roi_mask, cv2.COLOR_GRAY2BGR)
    display = np.where(mask3 == 255, display, dark)

    vehicle_count = 0
    type_count = {"Car": 0, "Bike": 0, "Bus": 0, "Truck": 0}

    yolo_boxes = []

    boxes = results[0].boxes

    # -----------------------------------------------------
    # YOLO detections
    # -----------------------------------------------------
    if boxes.id is not None:

        ids = boxes.id.cpu().numpy().astype(int)
        xyxy = boxes.xyxy.cpu().numpy().astype(int)
        cls = boxes.cls.cpu().numpy().astype(int)

        for box, track_id, class_id in zip(xyxy, ids, cls):

            x1, y1, x2, y2 = box

            cx = (x1 + x2) // 2
            cy = int(y1 + 0.85 * (y2 - y1))

            if cv2.pointPolygonTest(
                roi_contour,
                (float(cx), float(cy)),
                False
            ) < 0:
                continue

            yolo_boxes.append((x1, y1, x2, y2))

            label = VEHICLE_CLASSES[class_id]

            vehicle_count += 1
            type_count[label] += 1
            unique_ids.add(track_id)

            cv2.rectangle(display, (x1, y1), (x2, y2),
                          (0, 255, 0), 2)

            cv2.putText(display,
                        f"{label} ID:{track_id}",
                        (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 0),
                        2)

            cv2.circle(display, (cx, cy), 3,
                       (0, 0, 255), -1)

    # -----------------------------------------------------
    # HEADLIGHT-BASED BIKE DETECTION
    # -----------------------------------------------------
    headlights = detect_headlights(frame, roi_mask)

    for cx, cy, x, y, w, h in headlights:

        inside_existing = False

        for bx1, by1, bx2, by2 in yolo_boxes:
            if bx1 <= cx <= bx2 and by1 <= cy <= by2:
                inside_existing = True
                break

        if inside_existing:
            continue

        vehicle_count += 1
        type_count["Bike"] += 1

        cv2.rectangle(display, (x, y), (x + w, y + h),
                      (255, 0, 0), 2)

        cv2.putText(display, "Bike(HL)",
                    (x, y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    (255, 0, 0),
                    2)

        cv2.circle(display, (cx, cy), 3,
                   (255, 0, 0), -1)

    # -----------------------------------------------------
    # ROI overlay
    # -----------------------------------------------------
    overlay = display.copy()
    cv2.fillPoly(overlay, [lane_roi_resized], (0, 255, 255))
    display = cv2.addWeighted(overlay, 0.16, display, 0.84, 0)

    cv2.polylines(display, [lane_roi_resized], True,
                  (0, 255, 255), 3)

    # -----------------------------------------------------
    # TRAFFIC DENSITY CALCULATION
    # -----------------------------------------------------
    density_percentage = (vehicle_count / LANE_CAPACITY) * 100
    if density_percentage < 40:
        density_status = "Low"
        density_color = (0, 255, 0)   # Green
    elif density_percentage < 80:
        density_status = "Medium"
        density_color = (0, 255, 255) # Yellow
    else:
        density_status = "Heavy"
        density_color = (0, 0, 255)   # Red

    # -----------------------------------------------------
    # FPS
    # -----------------------------------------------------
    current_time = time.time()
    fps = FRAME_SKIP / (current_time - prev_time)
    prev_time = current_time

    # -----------------------------------------------------
    # Dashboard
    # -----------------------------------------------------
    # Extended dashboard height to fit Density
    cv2.rectangle(display, (10, 10), (340, 290),
                  (20, 20, 20), -1)

    cv2.putText(display, f"Vehicles : {vehicle_count}",
                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                (255, 255, 255), 2)

    cv2.putText(display, f"Density  : {density_status}",
                (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                density_color, 2)

    cv2.putText(display, f"Unique Vehicles: {len(unique_ids)}",
                (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                (255, 255, 255), 2)

    cv2.putText(display, f"FPS : {fps:.1f}",
                (20, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                (0, 255, 0), 2)

    cv2.putText(display, "Vehicle Types",
                (20, 170), cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                (0, 255, 255), 2)

    cv2.putText(display, f"Cars   : {type_count['Car']}",
                (20, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2)

    cv2.putText(display, f"Bikes  : {type_count['Bike']}",
                (20, 225), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2)

    cv2.putText(display, f"Buses  : {type_count['Bus']}",
                (20, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2)

    cv2.putText(display, f"Trucks : {type_count['Truck']}",
                (20, 275), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (255, 255, 255), 2)

    # -----------------------------------------------------
    # Display
    # -----------------------------------------------------
    cv2.imshow("Single Lane Vehicle Detection - YOLOv10", display)

    if cv2.waitKey(1) & 0xFF == 27:
        break

# =========================================================
# CLEANUP
# =========================================================
cap.release()
cv2.destroyAllWindows()

print("====================================")
print(f"Total unique vehicles: {len(unique_ids)}")
print("====================================")
