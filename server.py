"""
Campus Sentinel - High Performance Live Surveillance & YOLOv8 Inference Server
Thread-safe background vision pipeline with real-time MJPEG streaming & status telemetry.
"""

import os
import sys
import time
import json
import torch
import cv2
import datetime
import threading
import numpy as np
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import mimetypes
import urllib.parse
from ultralytics import YOLO
from classroom_engine import classroom_worker, shared_camera

# -----------------------------------------------------------------------------
# 1. Global Model Loading & Device Allocation
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(BASE_DIR, 'dashboard')
DEVICE = 0 if torch.cuda.is_available() else 'cpu'

# Select weights (prefers pose yolov8n-pose.pt for human keypoints & posture)
model_path = os.path.join(BASE_DIR, 'yolov8n-pose.pt')
if not os.path.exists(model_path):
    model_path = os.path.join(BASE_DIR, 'yolov8n.pt')

print(f"[Campus Sentinel] Loading weights from: {model_path} onto device: {DEVICE}")
model = YOLO(model_path)

# -----------------------------------------------------------------------------
# 2. Thread-Safe Background Camera & Inference Worker
# -----------------------------------------------------------------------------
class CameraWorker(threading.Thread):
    def __init__(self, source=0):
        super().__init__(daemon=True)
        self.source = source
        self.running = True
        self.lock = threading.Lock()
        self.latest_jpeg = None
        self.head_turn_buffer = 0
        self.threshold_frames = 20  # ~1.5s persistence threshold
        self.phone_buffer = 0
        self.latest_telemetry = {
            "status": "NORMAL",
            "reason": "NONE",
            "person_count": 0,
            "phone_detected": False,
            "confidence": 0.0,
            "fps": 0.0,
            "timestamp": datetime.datetime.now().isoformat()
        }

    def run(self):
        prev_time = time.time()
        print("[Campus Sentinel] Camera capture active via SharedCamera. Starting YOLOv8 inference loop...")

        while self.running:
            success, frame = shared_camera.read()
            if not success or frame is None:
                # Standby frame if camera not ready
                blank = np.zeros((480, 640, 3), dtype=np.uint8) + 20
                cv2.putText(blank, "CAM_01_EXAM_HALL // OPTICAL SENSOR INITIALIZING...", (30, 240),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 200, 255), 2)
                ret, buffer = cv2.imencode('.jpg', blank)
                if ret:
                    with self.lock:
                        self.latest_jpeg = buffer.tobytes()
                time.sleep(0.04)
                continue

            curr_time = time.time()
            fps = 1.0 / max(0.001, (curr_time - prev_time))
            prev_time = curr_time

            # 1. Run YOLO inference with imgsz=480 for fast, high-FPS CPU inference
            results = model(frame, imgsz=480, conf=0.25, iou=0.45, device=DEVICE, verbose=False)[0]

            person_boxes = []
            phone_boxes = []
            keypoints_list = []
            is_threat = False
            threat_reason = "NONE"
            h_frame, w_frame = frame.shape[:2]
            frame_area = h_frame * w_frame

            # 2. Parse boxes & classes
            if results.boxes is not None and len(results.boxes) > 0:
                boxes = results.boxes.xyxy.cpu().numpy()
                classes = results.boxes.cls.cpu().numpy().astype(int)
                confs = results.boxes.conf.cpu().numpy()
                names = results.names

                for box, cls_id, conf in zip(boxes, classes, confs):
                    cls_name = names.get(cls_id, str(cls_id)).lower()
                    bx1, by1, bx2, by2 = box
                    box_area = (bx2 - bx1) * (by2 - by1)
                    if cls_name == 'person' or cls_id == 0:
                        # Exclude tiny background noise/shadows (require min 3.5% area & conf >= 0.28)
                        if box_area > (0.035 * frame_area) and conf >= 0.28:
                            person_boxes.append((box, conf))
                    elif cls_name in ['cell phone', 'phone'] or cls_id == 67:
                        phone_boxes.append((box, conf))
                    elif cls_name in ['book'] or cls_id == 73:
                        is_threat = True
                        threat_reason = "UNAUTHORIZED STUDY MATERIAL"

            # Temporal filter for phone detection
            if phone_boxes:
                self.phone_buffer = min(15, self.phone_buffer + 1)
                if self.phone_buffer >= 3:
                    is_threat = True
                    threat_reason = "CELL PHONE DETECTED"
            else:
                self.phone_buffer = max(0, self.phone_buffer - 1)

            # Multi-person alert in exam zone
            if len(person_boxes) > 1:
                is_threat = True
                threat_reason = f"MULTIPLE PERSONS ({len(person_boxes)})"

            # Parse pose keypoints & gaze tracking with temporal persistence
            head_turn_anomaly = False
            if hasattr(results, 'keypoints') and results.keypoints is not None and results.keypoints.data is not None:
                kpts_data = results.keypoints.data.cpu().numpy()
                keypoints_list = kpts_data
                for kpts in kpts_data:
                    if len(kpts) >= 5:
                        nose, l_ear, r_ear = kpts[0], kpts[3], kpts[4]
                        if nose[2] > 0.30 and l_ear[2] > 0.15 and r_ear[2] > 0.15:
                            ear_dist = abs(l_ear[0] - r_ear[0])
                            if ear_dist > 12:
                                ratio = abs(nose[0] - l_ear[0]) / ear_dist
                                if ratio < 0.16 or ratio > 0.84:
                                    head_turn_anomaly = True

            if head_turn_anomaly:
                self.head_turn_buffer = min(self.threshold_frames + 5, self.head_turn_buffer + 1)
                if self.head_turn_buffer >= self.threshold_frames:
                    is_threat = True
                    threat_reason = "SUSTAINED HEAD TURN"
            else:
                self.head_turn_buffer = max(0, self.head_turn_buffer - 2)

            # 3. Render Annotations onto Frame
            annotated_frame = frame.copy()

            # Render Candidate Bounding Boxes
            for idx, (p_box, conf) in enumerate(person_boxes):
                x1, y1, x2, y2 = map(int, p_box)
                box_color = (0, 0, 255) if is_threat else (0, 230, 0)
                status_label = f"ALERT: {threat_reason}" if is_threat else f"ID:{idx+1:02d} | CANDIDATE | NORMAL ({conf*100:.0f}%)"

                # Solid bounding box
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 2)

                # Corner accent marks
                clen = min(22, int((x2 - x1) * 0.15))
                cv2.line(annotated_frame, (x1, y1), (x1 + clen, y1), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x1, y1), (x1, y1 + clen), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x2, y1), (x2 - clen, y1), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x2, y1), (x2, y1 + clen), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x1, y2), (x1 + clen, y2), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x1, y2), (x1, y2 - clen), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x2, y2), (x2 - clen, y2), (255, 255, 255), 2)
                cv2.line(annotated_frame, (x2, y2), (x2, y2 - clen), (255, 255, 255), 2)

                # Header tag
                (tw, th), _ = cv2.getTextSize(status_label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                banner_y1 = max(0, y1 - th - 8)
                cv2.rectangle(annotated_frame, (x1, banner_y1), (x1 + tw + 12, y1), box_color, -1)
                cv2.putText(annotated_frame, status_label, (x1 + 6, y1 - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

                # Plot candidate pose keypoints
                if idx < len(keypoints_list):
                    cand_kpts = keypoints_list[idx]
                    if len(cand_kpts) > 0 and cand_kpts[0][2] > 0.3:
                        # Nose (yellow dot)
                        cv2.circle(annotated_frame, (int(cand_kpts[0][0]), int(cand_kpts[0][1])), 5, (0, 255, 255), -1)
                    # Wrists (indices 9, 10)
                    for w_idx in (9, 10):
                        if len(cand_kpts) > w_idx and cand_kpts[w_idx][2] > 0.3:
                            cv2.circle(annotated_frame, (int(cand_kpts[w_idx][0]), int(cand_kpts[w_idx][1])), 5, (0, 200, 255), -1)

            # Highlight Cell Phone Detection if any
            for ph_box, ph_conf in phone_boxes:
                px1, py1, px2, py2 = map(int, ph_box)
                cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), (0, 0, 255), 3)
                p_label = f"THREAT: MOBILE PHONE ({ph_conf*100:.0f}%)"
                cv2.rectangle(annotated_frame, (px1, max(0, py1 - 22)), (px1 + 220, py1), (0, 0, 255), -1)
                cv2.putText(annotated_frame, p_label, (px1 + 4, py1 - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 2)

            # Top Telemetry Header Bar
            cv2.rectangle(annotated_frame, (0, 0), (annotated_frame.shape[1], 36), (15, 17, 24), -1)
            cv2.line(annotated_frame, (0, 36), (annotated_frame.shape[1], 36), (50, 55, 75), 1)

            status_text = "THREAT ACTIVE" if is_threat else "ALL CLEAR"
            status_bgr = (0, 0, 255) if is_threat else (0, 230, 0)
            hud_str = f"CAM_01_EXAM_HALL // LIVE AI [YOLOv8] | FPS: {fps:.1f} | CANDIDATES: {len(person_boxes)} | STATUS: {status_text}"
            cv2.putText(annotated_frame, hud_str, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.48, status_bgr, 2)

            # Encode frame to JPEG bytes
            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                with self.lock:
                    self.latest_jpeg = buffer.tobytes()
                    self.latest_telemetry = {
                        "status": "SUSPICIOUS" if is_threat else "NORMAL",
                        "reason": threat_reason,
                        "person_count": len(person_boxes),
                        "phone_detected": len(phone_boxes) > 0,
                        "confidence": float(person_boxes[0][1]) if person_boxes else 0.0,
                        "fps": round(fps, 1),
                        "timestamp": datetime.datetime.now().isoformat()
                    }

        # SharedCamera handles lifecycle

camera_worker = CameraWorker()
camera_worker.start()

# -----------------------------------------------------------------------------
# 3. HTTP Server & Endpoints
# -----------------------------------------------------------------------------
class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class SentinelRequestHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_GET(self):
        # 1. MJPEG Stream Route
        if self.path.startswith('/video_feed'):
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, pre-check=0, post-check=0, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            last_sent = None
            try:
                while True:
                    with camera_worker.lock:
                        frame_bytes = camera_worker.latest_jpeg
                    if frame_bytes is not None and frame_bytes != last_sent:
                        last_sent = frame_bytes
                        self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                        self.wfile.flush()
                    time.sleep(0.02)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            return

        # 2. Live Telemetry / Status Route (Webcam)
        if self.path.startswith('/status') or self.path.startswith('/api/telemetry'):
            with camera_worker.lock:
                telemetry_data = dict(camera_worker.latest_telemetry)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(telemetry_data).encode('utf-8'))
            return

        # 3. Dedicated Classroom Simulator MJPEG Stream Route
        if self.path.startswith('/classroom_stream'):
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=frame')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, pre-check=0, post-check=0, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            last_sent = None
            try:
                while True:
                    with classroom_worker.lock:
                        frame_bytes = classroom_worker.latest_jpeg
                    if frame_bytes is not None and frame_bytes != last_sent:
                        last_sent = frame_bytes
                        self.wfile.write(b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                        self.wfile.flush()
                    time.sleep(0.02)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            return

        # 4. Dedicated Classroom Telemetry / Status Route
        if self.path.startswith('/classroom_status'):
            with classroom_worker.lock:
                classroom_data = dict(classroom_worker.latest_telemetry)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(classroom_data).encode('utf-8'))
            return

        # 5. Classroom Malpractice Simulation Trigger API
        if self.path.startswith('/api/classroom_trigger'):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            desk = params.get('desk', ['DESK_04'])[0]
            action = params.get('action', params.get('anomaly', ['PEEKING']))[0]
            classroom_worker.trigger_anomaly(desk, action)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "desk": desk, "action": action}).encode('utf-8'))
            return

        # 6. Classroom Reset API
        if self.path.startswith('/api/classroom_reset'):
            classroom_worker.reset_all()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "action": "RESET"}).encode('utf-8'))
            return

        # 7. Static Files (Dashboard UI)
        raw_path = self.path.split('?')[0].strip('/')
        if raw_path == '':
            raw_path = 'index.html'

        file_path = os.path.join(DASHBOARD_DIR, raw_path)
        if os.path.exists(file_path) and not os.path.isdir(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_response(200)
            self.send_header('Content-Type', mime_type or 'application/octet-stream')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

    def log_message(self, format, *args):
        # Mute high-frequency frame logs
        if "video_feed" not in args[0] and "status" not in args[0] and "classroom" not in args[0]:
            super().log_message(format, *args)

def run_server(port=8080):
    server = ThreadingHTTPServer(('0.0.0.0', port), SentinelRequestHandler)
    print("=" * 65)
    print(f" CAMPUS SENTINEL // AI VIDEO SURVEILLANCE SERVER")
    print(f" Stream & Dashboard: http://localhost:{port}")
    print(f" Live Webcam Feed:   http://localhost:{port}/video_feed")
    print(f" Classroom Stream:   http://localhost:{port}/classroom_stream")
    print(f" Classroom Status:   http://localhost:{port}/classroom_status")
    print(f" Inference Device:   {DEVICE}")
    print("=" * 65)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Campus Sentinel] Shutting down server gracefully...")
        camera_worker.running = False
        classroom_worker.running = False
        server.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080
    run_server(port)
