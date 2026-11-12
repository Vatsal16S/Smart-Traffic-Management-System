import cv2
import numpy as np
from ultralytics import YOLO

# Global variables for interactive ROI selection
roi_pts = []

def draw_roi(event, x, y, flags, param):
    global roi_pts
    # Record point on left mouse click, up to 4 points
    if event == cv2.EVENT_LBUTTONDOWN:
        if len(roi_pts) < 4:
            roi_pts.append((x, y))

def main():
    global roi_pts
    
    # Load YOLOv10 model
    print("Loading YOLOv10 model...")
    model = YOLO('yolov10n.pt') 

    video_path = 'traffic_video.mp4' 
    cap = cv2.VideoCapture(video_path)

    # Read the first frame for ROI selection
    ret, first_frame = cap.read()
    if not ret:
        print("Error: Could not read video file. Please check 'video_path'.")
        return
        
    # --- INTERACTIVE ROI SELECTION ---
    window_name = 'Select Lane (Click 4 corners, then press ENTER)'
    cv2.namedWindow(window_name)
    cv2.setMouseCallback(window_name, draw_roi)
    
    print("\n--- ROI SETUP ---")
    print("Please click 4 points to define your EXACT lane on the video.")
    print("Suggested order: Top-Left, Top-Right, Bottom-Right, Bottom-Left.")
    print("Press ENTER when done drawing to start the detection.\n")

    while True:
        display_frame = first_frame.copy()
        
        # Draw the points and lines for user feedback
        for i, pt in enumerate(roi_pts):
            cv2.circle(display_frame, pt, 5, (0, 0, 255), -1)
            if i > 0:
                cv2.line(display_frame, roi_pts[i-1], pt, (0, 255, 255), 2)
                
        # Close the polygon if 4 points are selected
        if len(roi_pts) == 4:
            cv2.line(display_frame, roi_pts[3], roi_pts[0], (0, 255, 255), 2)
            cv2.putText(display_frame, 'Press ENTER to confirm!', (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)
            
        cv2.imshow(window_name, display_frame)
        
        # Break on ENTER key (13) if we have 4 points
        if cv2.waitKey(1) == 13 and len(roi_pts) == 4:
            break
            
    cv2.destroyWindow(window_name)
    lane_roi = np.array([roi_pts], np.int32)
    
    # Reset video capture to the beginning
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    vehicle_classes = [2, 3, 5, 7]
    class_names = {2: 'Car', 3: 'Motorcycle', 5: 'Bus', 7: 'Truck'}
    
    # --- TRAFFIC DENSITY SETTINGS ---
    # Define how many vehicles represent a "Full" lane
    # Adjust this based on how long the lane you drew is!
    LANE_CAPACITY = 8  
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Draw the lane ROI
        cv2.polylines(frame, [lane_roi], isClosed=True, color=(0, 255, 255), thickness=2)
        
        # Run YOLO inference
        results = model(frame)
        
        lane_vehicle_counts = {'Car': 0, 'Motorcycle': 0, 'Bus': 0, 'Truck': 0}
        total_vehicles_in_lane = 0
        
        for r in results:
            boxes = r.boxes
            for box in boxes:
                cls = int(box.cls[0])
                
                if cls in vehicle_classes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    # Calculate center point of the vehicle's bottom edge
                    center_x = (x1 + x2) // 2
                    center_y = y2 
                    
                    in_lane = cv2.pointPolygonTest(lane_roi, (center_x, center_y), False) >= 0
                    
                    if in_lane:
                        type_name = class_names[cls]
                        lane_vehicle_counts[type_name] += 1
                        total_vehicles_in_lane += 1
                        
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                        cv2.circle(frame, (center_x, center_y), 5, (0, 0, 255), -1)
                        cv2.putText(frame, f'{type_name}', (x1, y1 - 10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                    else:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        
        # --- TRAFFIC DENSITY CALCULATION ---
        density_percentage = (total_vehicles_in_lane / LANE_CAPACITY) * 100
        if density_percentage < 40:
            density_status = "Low"
            density_color = (0, 255, 0)   # Green
        elif density_percentage < 80:
            density_status = "Medium"
            density_color = (0, 255, 255) # Yellow
        else:
            density_status = "Heavy"
            density_color = (0, 0, 255)   # Red
            
        # --- UI DISPLAY ---
        cv2.rectangle(frame, (5, 5), (420, 220), (0, 0, 0), -1)
        
        cv2.putText(frame, f'Total in Lane: {total_vehicles_in_lane}', (15, 35), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2, cv2.LINE_AA)
                    
        cv2.putText(frame, f'Traffic Density: {density_status}', (15, 75), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, density_color, 2, cv2.LINE_AA)
                    
        y_offset = 120
        for v_type, count in lane_vehicle_counts.items():
            cv2.putText(frame, f'{v_type}: {count}', (15, y_offset), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2, cv2.LINE_AA)
            y_offset += 25
            
        cv2.imshow('Smart Traffic Management - Density', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == '__main__':
    main()
