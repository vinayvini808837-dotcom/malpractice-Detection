import cv2
import datetime
import numpy as np
from ultralytics import YOLO

# Load Single-Pass Multi-Person Pose Model
model = YOLO('yolov8n-pose.pt')

# Temporal Persistence Buffers: {track_id: consecutive_anomaly_frames}
head_turn_buffers = {}
suspect_registry = {}

FRAME_THRESHOLD = 40  # Must maintain bad posture for ~2.0 seconds at 20 FPS

def draw_exam_telemetry(frame, box, track_id, keypoints, status, reason):
    x1, y1, x2, y2 = map(int, box)
    color = (0, 0, 255) if status == "CONFIRMED" else (0, 255, 0)
    label = f"ID:{track_id} | {reason}" if status == "CONFIRMED" else f"ID:{track_id} | OK"

    # Draw Bounding Box & Skeleton Keypoints
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
    cv2.putText(frame, label, (x1, y1 - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    # Plot Nose Keypoint (Index 0)
    if len(keypoints) > 0:
        nose = keypoints[0] # [x, y, confidence]
        if nose[2] > 0.5:
            cv2.circle(frame, (int(nose[0]), int(nose[1])), 4, (0, 255, 255), -1)

    return frame

cap = cv2.VideoCapture(0) # Swap with RTSP stream for exam hall

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    # 1. Single forward pass for 30+ people & all skeletons
    results = model.track(frame, persist=True, tracker="botsort.yaml", verbose=False)[0]

    if results.boxes.id is not None and results.keypoints is not None:
        boxes = results.boxes.xyxy.cpu().numpy()
        track_ids = results.boxes.id.cpu().numpy().astype(int)
        keypoints_data = results.keypoints.data.cpu().numpy() # Shape: (N, 17, 3)

        for box, track_id, kpts in zip(boxes, track_ids, keypoints_data):
            
            # Extract keypoints: 0=Nose, 1=L_Eye, 2=R_Eye, 3=L_Ear, 4=R_Ear
            nose, l_ear, r_ear = kpts[0], kpts[3], kpts[4]
            
            is_anomaly = False
            
            # Head-Turn Heuristic (Requires valid keypoint detection)
            if nose[2] > 0.5 and l_ear[2] > 0.3 and r_ear[2] > 0.3:
                ear_dist = abs(l_ear[0] - r_ear[0])
                if ear_dist > 0:
                    nose_ratio = abs(nose[0] - l_ear[0]) / ear_dist
                    if nose_ratio < 0.15 or nose_ratio > 0.85: # Sharp head turn
                        is_anomaly = True

            # 2. Apply Temporal Persistence (Must persist > 2 seconds)
            if is_anomaly:
                head_turn_buffers[track_id] = head_turn_buffers.get(track_id, 0) + 1
                if head_turn_buffers[track_id] >= FRAME_THRESHOLD:
                    suspect_registry[track_id] = "SUSTAINED HEAD TURN (>2s)"
            else:
                # Decay buffer quickly when student looks back straight
                head_turn_buffers[track_id] = max(0, head_turn_buffers.get(track_id, 0) - 2)

            status = "CONFIRMED" if track_id in suspect_registry else "NORMAL"
            reason = suspect_registry.get(track_id, "NONE")
            frame = draw_exam_telemetry(frame, box, track_id, kpts, status, reason)

    # Telemetry Header
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 35), (20, 20, 20), -1)
    cv2.putText(frame, f"CAM_EXAM_HALL_01 | TRACKED: {len(head_turn_buffers)} | FLAGGED: {len(suspect_registry)}", 
                (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    cv2.imshow("Campus Sentinel - 30+ Student Scale Test", frame)
    
    key = cv2.waitKey(1) & 0xFF
    if key == ord('c'): 
        suspect_registry.clear()
        head_turn_buffers.clear()
    elif key == ord('q'): break

cap.release()
cv2.destroyAllWindows()