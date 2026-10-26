import cv2
import sys
import datetime
import numpy as np
from ultralytics import YOLO

# Load Single-Pass Multi-Person Pose Model
model = YOLO('yolov8n-pose.pt')

# Temporal Persistence Buffers & Registry
# Per-student tracking: {track_id: consecutive_anomaly_frames}
head_turn_buffers = {}
suspect_registry = {}
violation_start_times = {}
candidate_zones = {}

FRAME_THRESHOLD = 40  # Must maintain bad posture for ~2.0 seconds at 20 FPS

def draw_exam_telemetry(frame, box, track_id, keypoints, is_flagged, reason, elapsed_seconds):
    """
    Overlay Bounding Box Display Logic:
    - Render GREEN bounding box for normal students with candidate ID and NORMAL status.
    - Render RED bounding box around student WHEN actively flagged for malpractice.
    - Display alert label, cheating reason, and elapsed timer above the red bounding box.
    """
    x1, y1, x2, y2 = map(int, box)

    if not is_flagged:
        # 1. Draw GREEN bounding box for normal/sincere students
        green_color = (0, 230, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), green_color, 2)
        label = f"ID:{track_id:02d} | CANDIDATE | NORMAL"
        (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
        banner_y1 = max(0, y1 - text_h - 6)
        cv2.rectangle(frame, (x1, banner_y1), (x1 + text_w + 10, y1), (0, 160, 0), -1)
        cv2.putText(frame, label, (x1 + 5, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
        return frame

    red_color = (0, 0, 255)  # BGR Red (#FF0000)

    # 1. Draw RED bounding box around the violating student
    cv2.rectangle(frame, (x1, y1), (x2, y2), red_color, 2)

    # 2. Display alert label and timer above the red bounding box
    timer_str = f"{elapsed_seconds:.1f}s"
    label = f"ID:{track_id:02d} | {reason} | {timer_str}"

    (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 2)
    banner_y2 = max(text_h + 8, y1)
    banner_y1 = max(0, banner_y2 - text_h - 8)
    banner_x2 = min(frame.shape[1], x1 + text_w + 12)

    # Red filled header badge
    cv2.rectangle(frame, (x1, banner_y1), (banner_x2, banner_y2), red_color, -1)
    cv2.putText(frame, label, (x1 + 6, banner_y2 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

    # 3. Plot suspect evidence keypoints (Nose & Wrists) during violation
    if len(keypoints) > 0:
        # Nose keypoint (Index 0)
        nose = keypoints[0]
        if nose[2] > 0.4:
            cv2.circle(frame, (int(nose[0]), int(nose[1])), 4, (0, 255, 255), -1)

        # Wrists keypoints (Indices 9 & 10) for hand reach violations
        for wrist_idx in (9, 10):
            if len(keypoints) > wrist_idx and keypoints[wrist_idx][2] > 0.35:
                cv2.circle(frame, (int(keypoints[wrist_idx][0]), int(keypoints[wrist_idx][1])), 5, red_color, -1)

    return frame

# Camera / Video File / RTSP stream for exam hall
video_source = sys.argv[1] if len(sys.argv) > 1 else 0
if isinstance(video_source, str) and video_source.isdigit():
    video_source = int(video_source)
cap = cv2.VideoCapture(video_source)
camera_active = True

while cap.isOpened():
    key = cv2.waitKey(1) & 0xFF
    if key == ord('c') or key == ord('C'):
        suspect_registry.clear()
        head_turn_buffers.clear()
        violation_start_times.clear()
    elif key == ord('v') or key == ord('V') or key == ord('p') or key == 32:
        camera_active = not camera_active
    elif key == ord('q') or key == ord('Q'):
        break

    if not camera_active:
        standby_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(standby_frame, "CAM_EXAM_HALL_01 // CAMERA OFF [STANDBY]", (60, 220),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.70, (0, 165, 255), 2)
        cv2.putText(standby_frame, "Optical sensors paused. Press 'V' or 'SPACE' to activate", (50, 260),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)
        cv2.imshow("Campus Sentinel - Dynamic Multi-Student Exam Hall", standby_frame)
        continue

    ret, frame = cap.read()
    if not ret:
        break

    # 1. Dynamic Detection for ALL Students across the entire classroom
    # Lower confidence (0.25) to catch smaller/background students,
    # Increased max_det=50, and tuned NMS IoU=0.45 for closely seated candidates
    results = model.track(
        frame,
        persist=True,
        tracker="botsort.yaml",
        conf=0.25,
        iou=0.45,
        max_det=50,
        verbose=False
    )[0]

    active_candidate_ids = set()

    if results.boxes is not None and results.boxes.xyxy is not None:
        boxes = results.boxes.xyxy.cpu().numpy()
        # Fallback to enumerating if tracking IDs haven't initialized on frame 0
        if results.boxes.id is not None:
            track_ids = results.boxes.id.cpu().numpy().astype(int)
        else:
            track_ids = np.arange(1, len(boxes) + 1)

        keypoints_data = results.keypoints.data.cpu().numpy() if results.keypoints is not None else [[]] * len(boxes)

        for box, track_id, kpts in zip(boxes, track_ids, keypoints_data):
            active_candidate_ids.add(track_id)
            x1, y1, x2, y2 = box
            w = x2 - x1
            h = y2 - y1

            # Establish candidate desk / tracking zone dynamically
            if track_id not in candidate_zones:
                candidate_zones[track_id] = [
                    max(0, x1 - w * 0.2),
                    max(0, y1),
                    min(frame.shape[1], x2 + w * 0.2),
                    min(frame.shape[0], y2 + h * 0.15)
                ]

            is_anomaly = False
            anomaly_reason = "NONE"

            # Check Keypoint Heuristics
            if len(kpts) >= 5:
                # 0=Nose, 1=L_Eye, 2=R_Eye, 3=L_Ear, 4=R_Ear, 9=L_Wrist, 10=R_Wrist
                nose, l_ear, r_ear = kpts[0], kpts[3], kpts[4]

                # Heuristic 1: Sustained Head Turn Gaze Ratio
                if nose[2] > 0.4 and l_ear[2] > 0.25 and r_ear[2] > 0.25:
                    ear_dist = abs(l_ear[0] - r_ear[0])
                    if ear_dist > 0:
                        nose_ratio = abs(nose[0] - l_ear[0]) / ear_dist
                        if nose_ratio < 0.18 or nose_ratio > 0.82:
                            is_anomaly = True
                            anomaly_reason = "SUSTAINED HEAD TURN"
                elif nose[2] > 0.4 and (l_ear[2] < 0.15 and r_ear[2] > 0.45 or r_ear[2] < 0.15 and l_ear[2] > 0.45):
                    # Extreme profile turn where one ear is completely hidden
                    is_anomaly = True
                    anomaly_reason = "SUSTAINED HEAD TURN"

                # Heuristic 2: Phone / Chit Under Desk (Pitch Drop)
                if not is_anomaly and nose[2] > 0.4 and l_ear[2] > 0.25 and r_ear[2] > 0.25:
                    avg_ear_y = (l_ear[1] + r_ear[1]) / 2.0
                    if (nose[1] - avg_ear_y) > 0.40 * h:
                        is_anomaly = True
                        anomaly_reason = "PHONE UNDER DESK"

                # Heuristic 3: Hand Out of Zone / Cross-Desk Reach
                if not is_anomaly and len(kpts) > 10:
                    zone_x1, _, zone_x2, _ = candidate_zones[track_id]
                    for w_idx in (9, 10):
                        if kpts[w_idx][2] > 0.35:
                            wx = kpts[w_idx][0]
                            if wx < zone_x1 or wx > zone_x2:
                                is_anomaly = True
                                anomaly_reason = "HAND OUT OF ZONE"
                                break

            # 2. Temporal Persistence Filtering (>2.0 seconds sustained)
            if is_anomaly:
                head_turn_buffers[track_id] = head_turn_buffers.get(track_id, 0) + 1
                if head_turn_buffers[track_id] >= FRAME_THRESHOLD:
                    if track_id not in suspect_registry:
                        suspect_registry[track_id] = anomaly_reason
                        violation_start_times[track_id] = datetime.datetime.now()
            else:
                # Fast decay when student behaves sincerely
                head_turn_buffers[track_id] = max(0, head_turn_buffers.get(track_id, 0) - 2)
                if head_turn_buffers[track_id] == 0:
                    suspect_registry.pop(track_id, None)
                    violation_start_times.pop(track_id, None)

            # 3. Overlay Rendering: ONLY draw RED box and timer when actively flagged
            is_flagged = (track_id in suspect_registry)
            reason = suspect_registry.get(track_id, "NONE")
            elapsed_sec = 0.0
            if is_flagged and track_id in violation_start_times:
                elapsed_sec = (datetime.datetime.now() - violation_start_times[track_id]).total_seconds()
            elif is_flagged:
                elapsed_sec = head_turn_buffers.get(track_id, FRAME_THRESHOLD) / 20.0

            frame = draw_exam_telemetry(frame, box, track_id, kpts, is_flagged, reason, elapsed_sec)

    # Dynamic Multi-Student Telemetry Header Bar
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 36), (15, 17, 24), -1)
    cv2.line(frame, (0, 36), (frame.shape[1], 36), (40, 45, 60), 1)

    flagged_count = len(suspect_registry)
    status_color = (0, 0, 255) if flagged_count > 0 else (0, 240, 180)
    status_text = "THREAT ACTIVE" if flagged_count > 0 else "ALL NORMAL"

    header_msg = (
        f"CAM_EXAM_HALL // DYNAMIC DETECTION (ALL STUDENTS) | "
        f"TRACKED: {len(active_candidate_ids)} | FLAGGED: {flagged_count} [{status_text}] | "
        f"[V]: CAM [C]: RESET [Q]: EXIT"
    )
    cv2.putText(frame, header_msg, (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.44, status_color, 2)

    cv2.imshow("Campus Sentinel - Dynamic Multi-Student Exam Hall", frame)

cap.release()
cv2.destroyAllWindows()