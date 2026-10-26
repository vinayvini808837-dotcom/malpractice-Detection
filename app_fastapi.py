"""
Campus Sentinel - FastAPI Live Surveillance & AI Inference Server
Provides real-time MJPEG video streaming with YOLOv8 object/pose detection,
bounding box rendering (Green=Normal, Red=Alert), and exam integrity telemetry.
"""

import os
import cv2
import time
import torch
import datetime
from fastapi import FastAPI, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO

app = FastAPI(title="Campus Sentinel Vision Server")

# Allow CORS for browser client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# 1. Model Loading & Device Allocation (Loaded globally once at startup)
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEVICE = 0 if torch.cuda.is_available() else 'cpu'

# Select weights (prefers detection yolov8n.pt for phones/persons or yolov8n-pose.pt)
model_path = os.path.join(BASE_DIR, 'yolov8n.pt')
if not os.path.exists(model_path):
    model_path = os.path.join(BASE_DIR, 'yolov8n-pose.pt')

print(f"[Campus Sentinel] Loading YOLO weights from: {model_path} onto device: {DEVICE}")
model = YOLO(model_path)

# Tracking & Telemetry Buffers
head_turn_buffers = {}
suspect_registry = {}
violation_start_times = {}
latest_telemetry = {
    "status": "NORMAL",
    "reason": "NONE",
    "person_count": 0,
    "phone_detected": False,
    "confidence": 0.0,
    "fps": 0.0,
    "timestamp": datetime.datetime.now().isoformat()
}

# -----------------------------------------------------------------------------
# 2. Frame Inference & Processing Pipeline
# -----------------------------------------------------------------------------
def generate_frames():
    global latest_telemetry
    cap = cv2.VideoCapture(0)
    # Attempt to set reasonable resolution and format
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    prev_time = time.time()

    while True:
        success, frame = cap.read()
        if not success:
            # Generate standby placeholder if camera is unavailable
            placeholder = (20, 20, 30)
            blank = frame if frame is not None else np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(blank, "CAM_01_EXAM_HALL // OPTICAL SENSOR OFFLINE", (40, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 165, 255), 2)
            ret, buffer = cv2.imencode('.jpg', blank)
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.1)
            continue

        # FPS measurement
        curr_time = time.time()
        fps = 1.0 / max(0.001, (curr_time - prev_time))
        prev_time = curr_time

        # Run inference through YOLO model (conf=0.25, iou=0.45)
        results = model(frame, conf=0.25, iou=0.45, device=DEVICE, verbose=False)[0]

        # Analyze detections
        person_boxes = []
        phone_boxes = []
        is_threat = False
        threat_reason = "NONE"

        if results.boxes is not None and len(results.boxes) > 0:
            boxes = results.boxes.xyxy.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy().astype(int)
            confs = results.boxes.conf.cpu().numpy()
            names = results.names

            for box, cls_id, conf in zip(boxes, classes, confs):
                cls_name = names.get(cls_id, str(cls_id)).lower()
                if cls_name == 'person' or cls_id == 0:
                    person_boxes.append((box, conf))
                elif cls_name in ['cell phone', 'phone'] or cls_id == 67:
                    phone_boxes.append((box, conf))
                    is_threat = True
                    threat_reason = "CELL PHONE DETECTED"
                elif cls_name in ['book'] or cls_id == 73:
                    is_threat = True
                    threat_reason = "UNAUTHORIZED STUDY MATERIAL"

        # Check Multiple Persons in Exam Zone
        if len(person_boxes) > 1:
            is_threat = True
            threat_reason = f"MULTIPLE PERSONS ({len(person_boxes)})"

        # Check Pose keypoints (if using pose model)
        if hasattr(results, 'keypoints') and results.keypoints is not None and results.keypoints.data is not None:
            kpts_data = results.keypoints.data.cpu().numpy()
            for idx, kpts in enumerate(kpts_data):
                if len(kpts) >= 5:
                    nose, l_ear, r_ear = kpts[0], kpts[3], kpts[4]
                    if nose[2] > 0.35 and l_ear[2] > 0.2 and r_ear[2] > 0.2:
                        ear_dist = abs(l_ear[0] - r_ear[0])
                        if ear_dist > 0:
                            ratio = abs(nose[0] - l_ear[0]) / ear_dist
                            if ratio < 0.18 or ratio > 0.82:
                                is_threat = True
                                threat_reason = "SUSTAINED HEAD TURN"

        # 3. Render Annotations onto Frame
        annotated_frame = frame.copy()

        # Render Persons (Green for normal, Red for alert)
        if len(person_boxes) == 0:
            # Fallback face/person scan guide
            h, w = frame.shape[:2]
            cx1, cy1, cx2, cy2 = int(w * 0.30), int(h * 0.15), int(w * 0.70), int(h * 0.85)
            cv2.rectangle(annotated_frame, (cx1, cy1), (cx2, cy2), (0, 200, 100), 1)
            cv2.putText(annotated_frame, "SEARCHING FOR CANDIDATE...", (cx1 + 10, cy1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 100), 1)
        else:
            for idx, (p_box, conf) in enumerate(person_boxes):
                x1, y1, x2, y2 = map(int, p_box)
                box_color = (0, 0, 255) if is_threat else (0, 230, 0)
                status_label = f"ALERT: {threat_reason}" if is_threat else f"ID:{idx+1:02d} | CANDIDATE | NORMAL ({conf*100:.0f}%)"

                # Draw bounding box
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 2)

                # Header tag
                (tw, th), _ = cv2.getTextSize(status_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                banner_y1 = max(0, y1 - th - 8)
                cv2.rectangle(annotated_frame, (x1, banner_y1), (x1 + tw + 12, y1), box_color, -1)
                cv2.putText(annotated_frame, status_label, (x1 + 6, y1 - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

        # Highlight Cell Phone if detected
        for ph_box, ph_conf in phone_boxes:
            px1, py1, px2, py2 = map(int, ph_box)
            cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 0, 255), 3)
            p_label = f"THREAT: MOBILE PHONE ({ph_conf*100:.0f}%)"
            cv2.rectangle(annotated_frame, (px1, max(0, py1 - 22)), (px1 + 220, py1), (0, 0, 255), -1)
            cv2.putText(annotated_frame, p_label, (px1 + 4, py1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

        # Render Top HUD Telemetry Banner
        header_color = (15, 17, 24)
        cv2.rectangle(annotated_frame, (0, 0), (annotated_frame.shape[1], 36), header_color, -1)
        cv2.line(annotated_frame, (0, 36), (annotated_frame.shape[1], 36), (50, 55, 75), 1)

        status_text = "THREAT ACTIVE" if is_threat else "ALL CLEAR"
        status_bgr = (0, 0, 255) if is_threat else (0, 230, 0)
        hud_str = f"CAM_01_EXAM_HALL // LIVE AI [YOLOv8] | FPS: {fps:.1f} | CANDIDATES: {len(person_boxes)} | STATUS: {status_text}"
        cv2.putText(annotated_frame, hud_str, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, status_bgr, 2)

        # Update telemetry object
        latest_telemetry = {
            "status": "SUSPICIOUS" if is_threat else "NORMAL",
            "reason": threat_reason,
            "person_count": len(person_boxes),
            "phone_detected": len(phone_boxes) > 0,
            "confidence": float(person_boxes[0][1]) if person_boxes else 0.0,
            "fps": round(fps, 1),
            "timestamp": datetime.datetime.now().isoformat()
        }

        # Encode to JPEG and yield via MJPEG stream
        ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret:
            continue
        byte_data = buffer.tobytes()
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + byte_data + b'\r\n')

    cap.release()

# -----------------------------------------------------------------------------
# 3. HTTP Endpoints
# -----------------------------------------------------------------------------
@app.get("/video_feed")
def video_feed():
    """Multipart MJPEG video stream route with real-time YOLO detections."""
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/status")
def get_status():
    """Current exam integrity detection status."""
    return JSONResponse(content=latest_telemetry)

# -----------------------------------------------------------------------------
# Dedicated Classroom Simulator Endpoints
# -----------------------------------------------------------------------------
from classroom_engine import classroom_worker

def generate_classroom_frames():
    last_sent = None
    while True:
        with classroom_worker.lock:
            frame_bytes = classroom_worker.latest_jpeg
        if frame_bytes is not None and frame_bytes != last_sent:
            last_sent = frame_bytes
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.02)

@app.get("/classroom_stream")
def classroom_stream():
    """Dedicated wide-angle overhead classroom simulation stream."""
    return StreamingResponse(
        generate_classroom_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.get("/classroom_status")
def classroom_status():
    """Real-time spatial ROI desk status and malpractice heuristics telemetry."""
    with classroom_worker.lock:
        data = dict(classroom_worker.latest_telemetry)
    return JSONResponse(content=data)

@app.get("/api/classroom_trigger")
def trigger_classroom(desk: str = "DESK_04", action: str = "PEEKING"):
    classroom_worker.trigger_anomaly(desk, action)
    return JSONResponse(content={"success": True, "desk": desk, "action": action})

@app.get("/api/classroom_reset")
def reset_classroom():
    classroom_worker.reset_all()
    return JSONResponse(content={"success": True, "action": "RESET"})

# Mount Dashboard Frontend
dashboard_dir = os.path.join(BASE_DIR, "dashboard")
if os.path.exists(dashboard_dir):
    app.mount("/", StaticFiles(directory=dashboard_dir, html=True), name="dashboard")

if __name__ == "__main__":
    import uvicorn
    print("\n[Campus Sentinel] Launching FastAPI server on http://localhost:8080")
    uvicorn.run(app, host="0.0.0.0", port=8080)
