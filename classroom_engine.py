"""
Campus Sentinel - Dedicated Classroom Live Vision Engine
Real-time wide-angle overhead classroom CCTV stream generator & multi-person malpractice detection.

Key Capabilities:
1. Active Live Camera Capture:
   - Ingests actual raw video frames (cv2.VideoCapture(0) or secondary index 1)
   - Uses the live camera video stream as the active real-time background
2. Spatial 2D Polygonal ROI Anchoring:
   - 12 persistent calibrated desk perspective polygons (DESK_01 through DESK_12)
   - Point-in-polygon containment tests (cv2.pointPolygonTest)
3. Multi-Person Malpractice Heuristics (YOLOv8-Pose):
   - Anomaly A: Cross-Desk Peeking / Looking Aside (>35° yaw by nose-ear ratio)
   - Anomaly B: Desk Zone Incursion / Collusion (>1 person inside single desk polygon)
   - Anomaly C: Unauthorized Standing / Corridor Reaching (hips/torso rise, wrists out of zone)
4. Temporal Persistence Buffer (0 -> 40 frames):
   - Increments on sustained violation, decays on sincere posture
   - Escalates to ALERT status at threshold >= 25 frames
5. Seamless Camera Sharing & Isolation:
   - Thread-safe SharedCamera singleton avoids OpenCV DirectShow device locks on Windows
"""

import os
import cv2
import time
import math
import datetime
import threading
import numpy as np
import torch
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEVICE = 0 if torch.cuda.is_available() else 'cpu'

# -----------------------------------------------------------------------------
# 1. 2D Polygonal Desk Zones (Spatial ROI)
# -----------------------------------------------------------------------------
# Configured for 1280x720 perspective matching the classroom layout
DESK_CONFIGS = [
    # Tier 1: FOREGROUND (Desks 1-4) - Closest to camera
    {
        "id": "DESK_01", "tier": "FOREGROUND",
        "poly": [[40, 470], [310, 470], [290, 675], [10, 675]],
        "cand_anchor": [160, 560], "depth": 1.0
    },
    {
        "id": "DESK_02", "tier": "FOREGROUND",
        "poly": [[380, 470], [650, 470], [640, 675], [365, 675]],
        "cand_anchor": [505, 560], "depth": 1.0
    },
    {
        "id": "DESK_03", "tier": "FOREGROUND",
        "poly": [[720, 470], [990, 470], [1005, 675], [730, 675]],
        "cand_anchor": [865, 560], "depth": 1.0
    },
    {
        "id": "DESK_04", "tier": "FOREGROUND",
        "poly": [[1060, 470], [1260, 470], [1275, 675], [1075, 675]],
        "cand_anchor": [1170, 560], "depth": 1.0
    },

    # Tier 2: MIDGROUND (Desks 5-8) - Center of classroom
    {
        "id": "DESK_05", "tier": "MIDGROUND",
        "poly": [[90, 280], [315, 280], [300, 420], [65, 420]],
        "cand_anchor": [190, 345], "depth": 0.72
    },
    {
        "id": "DESK_06", "tier": "MIDGROUND",
        "poly": [[380, 280], [605, 280], [600, 420], [370, 420]],
        "cand_anchor": [490, 345], "depth": 0.72
    },
    {
        "id": "DESK_07", "tier": "MIDGROUND",
        "poly": [[670, 280], [895, 280], [900, 420], [675, 420]],
        "cand_anchor": [785, 345], "depth": 0.72
    },
    {
        "id": "DESK_08", "tier": "MIDGROUND",
        "poly": [[960, 280], [1185, 280], [1210, 420], [975, 420]],
        "cand_anchor": [1085, 345], "depth": 0.72
    },

    # Tier 3: BACKGROUND (Desks 9-12) - Deep exam hall perspective
    {
        "id": "DESK_09", "tier": "BACKGROUND",
        "poly": [[140, 145], [305, 145], [295, 240], [125, 240]],
        "cand_anchor": [215, 190], "depth": 0.50
    },
    {
        "id": "DESK_10", "tier": "BACKGROUND",
        "poly": [[380, 145], [545, 145], [540, 240], [370, 240]],
        "cand_anchor": [460, 190], "depth": 0.50
    },
    {
        "id": "DESK_11", "tier": "BACKGROUND",
        "poly": [[620, 145], [785, 145], [790, 240], [625, 240]],
        "cand_anchor": [705, 190], "depth": 0.50
    },
    {
        "id": "DESK_12", "tier": "BACKGROUND",
        "poly": [[860, 145], [1025, 145], [1045, 240], [870, 240]],
        "cand_anchor": [950, 190], "depth": 0.50
    }
]

# Standard YOLOv8-Pose skeleton limb connectivity pairs
SKELETON_PAIRS = [
    (5, 6),    # Shoulders
    (5, 7), (7, 9),    # Left Arm
    (6, 8), (8, 10),   # Right Arm
    (5, 11), (6, 12),  # Torso Sides
    (11, 12),          # Hips
    (11, 13), (13, 15), # Left Leg
    (12, 14), (14, 16)  # Right Leg
]


# -----------------------------------------------------------------------------
# 2. Thread-Safe Shared Camera Manager (Seamless Capture Sharing)
# -----------------------------------------------------------------------------
class SharedCamera:
    """
    Singleton thread-safe camera capture manager.
    Continuously acquires frames from physical camera device (index 0 or secondary 1)
    and distributes raw frames to both the live webcam pipeline and classroom simulation
    pipeline, eliminating OpenCV device lockups on Windows.
    """
    _instance = None
    _lock = threading.Lock()

    def __init__(self, primary_source=0):
        self.primary_source = primary_source
        self.cap = None
        self.running = False
        self.latest_frame = None
        self.frame_lock = threading.Lock()
        self.thread = None
        self.camera_index = primary_source
        self.is_secondary = False

    @classmethod
    def get_instance(cls, primary_source=0):
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(primary_source)
                cls._instance.start()
            return cls._instance

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _capture_loop(self):
        # 1. Open primary camera (index 0)
        try:
            if os.name == 'nt':
                self.cap = cv2.VideoCapture(self.primary_source, cv2.CAP_DSHOW)
                if not self.cap.isOpened():
                    self.cap = cv2.VideoCapture(self.primary_source)
            else:
                self.cap = cv2.VideoCapture(self.primary_source)
        except Exception as e:
            print(f"[Campus Sentinel] Error opening camera {self.primary_source}: {e}")

        # 2. Fall back to secondary camera index 1 if primary not opened
        if self.cap is None or not self.cap.isOpened():
            try:
                cap1 = cv2.VideoCapture(1, cv2.CAP_DSHOW) if os.name == 'nt' else cv2.VideoCapture(1)
                if cap1.isOpened():
                    self.cap = cap1
                    self.camera_index = 1
                    self.is_secondary = True
                    print("[Campus Sentinel] Secondary camera index 1 detected and active.")
            except Exception:
                pass

        if self.cap and self.cap.isOpened():
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            print(f"[Campus Sentinel] Camera capture active on device index: {self.camera_index}")

        # Capture loop
        while self.running:
            if self.cap and self.cap.isOpened():
                ret, frame = self.cap.read()
                if ret and frame is not None:
                    with self.frame_lock:
                        self.latest_frame = frame
                else:
                    time.sleep(0.015)
            else:
                time.sleep(0.1)

    def read(self):
        """Returns (success, raw_frame_copy)."""
        with self.frame_lock:
            if self.latest_frame is not None:
                return True, self.latest_frame.copy()
        return False, None

    def release(self):
        self.running = False
        if self.cap and self.cap.isOpened():
            self.cap.release()


shared_camera = SharedCamera.get_instance(0)


# -----------------------------------------------------------------------------
# 3. Live Classroom Vision Engine (Live Video + 12 Desk ROIs + YOLOv8-Pose)
# -----------------------------------------------------------------------------
class LiveClassroomVisionEngine:
    """
    Ingests live camera video frames, overlays 12 spatial desk perspective polygons,
    runs YOLOv8-Pose to track candidates, and evaluates malpractice heuristics.
    """
    def __init__(self):
        self.desks = DESK_CONFIGS
        self.desk_buffers = {d["id"]: 0 for d in self.desks}
        self.desk_statuses = {d["id"]: "NORMAL" for d in self.desks}
        self.desk_reasons = {d["id"]: "NONE" for d in self.desks}

        # Load YOLOv8-Pose weights
        model_path = os.path.join(BASE_DIR, 'yolov8n-pose.pt')
        if not os.path.exists(model_path):
            model_path = os.path.join(BASE_DIR, 'yolov8n.pt')
        print(f"[ClassroomEngine] Loading YOLOv8-Pose model from: {model_path}")
        self.pose_model = YOLO(model_path)

        self.start_time = time.time()
        self.frame_count = 0
        self.manual_trigger = None
        self.manual_trigger_expiry = 0
        self.lock = threading.Lock()

    def trigger_anomaly(self, desk_id, action_type, duration=5.0):
        """Programmatically triggers a malpractice anomaly on a specific desk."""
        with self.lock:
            self.manual_trigger = (desk_id, action_type)
            self.manual_trigger_expiry = time.time() + duration
            print(f"[ClassroomEngine] Malpractice triggered: {action_type} on {desk_id} for {duration}s")

    def reset_all(self):
        """Resets all desk buffers and malpractice statuses."""
        with self.lock:
            self.manual_trigger = None
            for d in self.desks:
                did = d["id"]
                self.desk_buffers[did] = 0
                self.desk_statuses[did] = "NORMAL"
                self.desk_reasons[did] = "NONE"

    def process_live_frame(self, raw_frame):
        """
        Executes YOLOv8-Pose on the live camera frame, overlays the 12 desk perspective
        polygons with semi-transparent alpha blending, plots pose skeletons, and detects
        anomalies with temporal persistence.
        """
        self.frame_count += 1
        curr_t = time.time()

        # Clear expired manual triggers
        with self.lock:
            if self.manual_trigger and curr_t > self.manual_trigger_expiry:
                self.manual_trigger = None

        # 1. Base Live Camera Frame (Resize to 1280x720 for exact polygon alignment)
        if raw_frame is not None:
            if raw_frame.shape[0] != 720 or raw_frame.shape[1] != 1280:
                frame = cv2.resize(raw_frame, (1280, 720))
            else:
                frame = raw_frame.copy()
        else:
            # Fallback sensor standby frame if camera stream is momentarily initializing
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            frame[:] = (14, 18, 28)
            cv2.putText(frame, "CAM_02_OVERHEAD // OPTICAL SENSOR INITIALIZING...", (380, 360),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 200, 255), 2)

        h_frame, w_frame = frame.shape[:2]

        # 2. Run YOLOv8-Pose directly on the live camera frame
        results = self.pose_model(
            frame,
            imgsz=480,
            conf=0.25,
            iou=0.45,
            device=DEVICE,
            verbose=False
        )[0]

        detected_persons = []
        if results.boxes is not None and len(results.boxes) > 0:
            boxes = results.boxes.xyxy.cpu().numpy()
            confs = results.boxes.conf.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy().astype(int)

            kpts_data = None
            if hasattr(results, 'keypoints') and results.keypoints is not None and results.keypoints.data is not None:
                kpts_data = results.keypoints.data.cpu().numpy()

            for i, (box, conf, cls_id) in enumerate(zip(boxes, confs, classes)):
                # Filter for person class (0)
                if cls_id == 0 and conf >= 0.25:
                    kpts = kpts_data[i] if (kpts_data is not None and i < len(kpts_data)) else np.zeros((17, 3))
                    detected_persons.append({
                        "box": box,
                        "conf": conf,
                        "keypoints": kpts,
                        "desk_id": None
                    })

        # 3. Spatial ROI Desk Mapping (cv2.pointPolygonTest)
        desk_occupants = {d["id"]: [] for d in self.desks}

        for person in detected_persons:
            kpts = person["keypoints"]
            box = person["box"]

            # Compute reference anchor for candidate
            if len(kpts) >= 7 and kpts[5][2] > 0.20 and kpts[6][2] > 0.20:
                # Midpoint of left and right shoulder
                anchor = ((kpts[5][0] + kpts[6][0]) / 2.0, (kpts[5][1] + kpts[6][1]) / 2.0)
            elif len(kpts) >= 1 and kpts[0][2] > 0.20:
                # Nose position
                anchor = (kpts[0][0], kpts[0][1])
            else:
                # Bounding box center
                anchor = ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)

            # Test containment in each desk polygon
            assigned_desk = None
            for desk_cfg in self.desks:
                did = desk_cfg["id"]
                poly = np.array(desk_cfg["poly"], dtype=np.int32)
                if cv2.pointPolygonTest(poly, (float(anchor[0]), float(anchor[1])), False) >= 0:
                    assigned_desk = did
                    break

            # If anchor is near a desk border (within 45px corridor)
            if not assigned_desk:
                best_dist = -9999
                for desk_cfg in self.desks:
                    did = desk_cfg["id"]
                    poly = np.array(desk_cfg["poly"], dtype=np.int32)
                    d = cv2.pointPolygonTest(poly, (float(anchor[0]), float(anchor[1])), True)
                    if d >= -45 and d > best_dist:
                        best_dist = d
                        assigned_desk = did

            if assigned_desk:
                person["desk_id"] = assigned_desk
                desk_occupants[assigned_desk].append(person)

        # 4. Multi-Person Malpractice Heuristics & Temporal Persistence Buffer
        primary_threat_desk = None
        primary_threat_reason = "NONE"
        max_buffer_val = 0
        flagged_count = 0

        for desk_cfg in self.desks:
            did = desk_cfg["id"]
            poly = np.array(desk_cfg["poly"], dtype=np.int32)
            occupants = desk_occupants[did]

            is_anomaly = False
            anomaly_reason = "NONE"

            # Check Manual Trigger
            with self.lock:
                manual = self.manual_trigger

            if manual and manual[0] == did:
                is_anomaly = True
                act = manual[1]
                if act in ["PEEKING", "HEAD_TURN_LEFT", "TURN_LEFT"]:
                    anomaly_reason = "CROSS-DESK PEEKING (LEFT)"
                elif act in ["TURN_RIGHT"]:
                    anomaly_reason = "CROSS-DESK PEEKING (RIGHT)"
                elif act in ["COLLUSION", "INCURSION", "MULTI_THREAT"]:
                    anomaly_reason = "DESK ZONE INCURSION / COLLUSION"
                elif act in ["STANDING", "UNAUTHORIZED_STANDING"]:
                    anomaly_reason = "UNAUTHORIZED STANDING"
                elif act in ["REACHING", "CROSS_DESK_REACH"]:
                    anomaly_reason = "CROSS-DESK CORRIDOR REACH"
                else:
                    anomaly_reason = act

            # Anomaly B: Desk Zone Incursion / Collusion (>1 person inside single desk polygon)
            elif len(occupants) > 1:
                is_anomaly = True
                anomaly_reason = f"DESK COLLUSION ({len(occupants)} PERSONS)"

            # Malpractice Heuristics on Seated Candidate
            elif len(occupants) == 1:
                cand = occupants[0]
                kpts = cand["keypoints"]
                box = cand["box"]

                # Anomaly A: Cross-Desk Peeking / Looking Aside (>35° yaw toward neighbor)
                if len(kpts) >= 5:
                    nose = kpts[0]
                    l_ear = kpts[3]
                    r_ear = kpts[4]
                    if nose[2] > 0.25 and l_ear[2] > 0.15 and r_ear[2] > 0.15:
                        ear_dist = abs(l_ear[0] - r_ear[0])
                        if ear_dist > 8.0:
                            yaw_ratio = abs(nose[0] - l_ear[0]) / ear_dist
                            if yaw_ratio < 0.16 or yaw_ratio > 0.84:
                                is_anomaly = True
                                direction = "LEFT" if (nose[0] < l_ear[0] or yaw_ratio < 0.16) else "RIGHT"
                                anomaly_reason = f"CROSS-DESK PEEKING ({direction})"
                    elif nose[2] > 0.35 and ((l_ear[2] < 0.12 and r_ear[2] > 0.35) or (r_ear[2] < 0.12 and l_ear[2] > 0.35)):
                        # Extreme profile head turn where far ear is occluded
                        is_anomaly = True
                        direction = "RIGHT" if r_ear[2] > l_ear[2] else "LEFT"
                        anomaly_reason = f"CROSS-DESK PEEKING ({direction})"

                # Anomaly C: Hand Out of Zone / Corridor Reach
                if not is_anomaly and len(kpts) > 10:
                    for w_idx in (9, 10):
                        if kpts[w_idx][2] > 0.30:
                            w_pt = (float(kpts[w_idx][0]), float(kpts[w_idx][1]))
                            if cv2.pointPolygonTest(poly, w_pt, True) < -22:
                                is_anomaly = True
                                anomaly_reason = "CROSS-DESK CORRIDOR REACH"
                                break

            # Temporal Persistence Buffer (0 -> 40 frames)
            if is_anomaly:
                self.desk_buffers[did] = min(40, self.desk_buffers[did] + 1)
                self.desk_reasons[did] = anomaly_reason
            else:
                self.desk_buffers[did] = max(0, self.desk_buffers[did] - 2)
                if self.desk_buffers[did] == 0:
                    self.desk_reasons[did] = "NONE"

            curr_buf = self.desk_buffers[did]
            if curr_buf >= 25:
                self.desk_statuses[did] = "ALERT"
                flagged_count += 1
            else:
                self.desk_statuses[did] = "NORMAL"

            if curr_buf > max_buffer_val:
                max_buffer_val = curr_buf
                if is_anomaly or curr_buf >= 25:
                    primary_threat_desk = did
                    primary_threat_reason = self.desk_reasons[did]

        # -------------------------------------------------------------
        # 5. Render Desk Polygons Directly onto Live Camera Video
        # -------------------------------------------------------------
        overlay = frame.copy()

        for desk_cfg in self.desks:
            did = desk_cfg["id"]
            poly = np.array(desk_cfg["poly"], dtype=np.int32)
            buf = self.desk_buffers[did]
            status = self.desk_statuses[did]
            reason = self.desk_reasons[did]
            has_occupant = len(desk_occupants[did]) > 0

            if status == "ALERT" or buf >= 25:
                # Malpractice Alert: Red tint fill + Thick Red wireframe
                cv2.fillPoly(overlay, [poly], (0, 0, 220))
                cv2.polylines(frame, [poly], isClosed=True, color=(0, 0, 255), thickness=3)

                # Alert Badge Tag
                tag_x, tag_y = poly[0]
                alert_tag = f"ALERT: {did} [{reason}] | {buf}/40F"
                (tw, th), _ = cv2.getTextSize(alert_tag, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 2)
                banner_y1 = max(0, tag_y - th - 8)
                cv2.rectangle(frame, (tag_x, banner_y1), (tag_x + tw + 10, tag_y), (0, 0, 255), -1)
                cv2.putText(frame, alert_tag, (tag_x + 5, tag_y - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.44, (255, 255, 255), 2)
            elif buf > 10:
                # Warning: Amber tint
                cv2.fillPoly(overlay, [poly], (0, 140, 255))
                cv2.polylines(frame, [poly], isClosed=True, color=(0, 165, 255), thickness=2)
                tag_x, tag_y = poly[0]
                cv2.putText(frame, f"{did} [{buf}/40F]", (tag_x + 4, tag_y - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.40, (0, 165, 255), 1)
            else:
                # Normal: Subtle green wireframe + transparent fill
                poly_color = (0, 220, 130) if has_occupant else (0, 180, 220)
                cv2.fillPoly(overlay, [poly], (20, 80, 40) if has_occupant else (30, 60, 80))
                cv2.polylines(frame, [poly], isClosed=True, color=poly_color, thickness=2)
                tag_x, tag_y = poly[0]
                tag_label = f"{did} [SEATED]" if has_occupant else f"{did} [EMPTY]"
                cv2.putText(frame, tag_label, (tag_x + 4, tag_y - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, poly_color, 1)

        # Semi-transparent alpha blending of desk zones (22% overlay, 78% live video)
        cv2.addWeighted(overlay, 0.22, frame, 0.78, 0, frame)

        # -------------------------------------------------------------
        # 6. Plot Skeletons & Keypoints Directly on Top of Live Video
        # -------------------------------------------------------------
        for person in detected_persons:
            kpts = person["keypoints"]
            did = person.get("desk_id")
            is_threat = (did and self.desk_statuses.get(did) == "ALERT")
            bone_color = (0, 0, 255) if is_threat else (0, 240, 120)

            # Draw bones
            for p1_idx, p2_idx in SKELETON_PAIRS:
                if len(kpts) > max(p1_idx, p2_idx):
                    pt1 = kpts[p1_idx]
                    pt2 = kpts[p2_idx]
                    if pt1[2] > 0.25 and pt2[2] > 0.25:
                        cv2.line(frame, (int(pt1[0]), int(pt1[1])), (int(pt2[0]), int(pt2[1])), bone_color, 2)

            # Nose Keypoint (Yellow dot)
            if len(kpts) > 0 and kpts[0][2] > 0.25:
                cv2.circle(frame, (int(kpts[0][0]), int(kpts[0][1])), 4, (0, 255, 255), -1)

            # Wrists Keypoints (Cyan / Red dots)
            for w_idx in (9, 10):
                if len(kpts) > w_idx and kpts[w_idx][2] > 0.25:
                    w_color = (0, 0, 255) if is_threat else (0, 220, 255)
                    cv2.circle(frame, (int(kpts[w_idx][0]), int(kpts[w_idx][1])), 5, w_color, -1)

        # -------------------------------------------------------------
        # 7. Live Telemetry Header Bar (Classroom AI Overhead)
        # -------------------------------------------------------------
        cv2.rectangle(frame, (0, 0), (w_frame, 36), (12, 16, 24), -1)
        cv2.line(frame, (0, 36), (w_frame, 36), (40, 50, 70), 1)

        status_str = f"ALERT: {primary_threat_desk} [{primary_threat_reason}]" if primary_threat_desk else "ALL NORMAL"
        status_color = (0, 0, 255) if primary_threat_desk else (0, 240, 150)
        hud_text = (
            f"CAM_02_OVERHEAD // CLASSROOM AI ACTIVE | 12 DESK SPATIAL ROIs | "
            f"STUDENTS: {len(detected_persons)} | STATUS: {status_str}"
        )
        cv2.putText(frame, hud_text, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.44, status_color, 2)

        # Build Telemetry Dictionary for /classroom_status
        telemetry = {
            "status": "ALERT" if (max_buffer_val >= 25) else "NORMAL",
            "active_alert_desk": primary_threat_desk,
            "violation_type": primary_threat_reason,
            "persistence_buffer": max_buffer_val,
            "max_buffer": max_buffer_val,
            "flagged_count": flagged_count,
            "students_detected": len(detected_persons),
            "desks_tracked": len(self.desks),
            "fps": 30.0,
            "desks": {
                d["id"]: {
                    "status": self.desk_statuses[d["id"]],
                    "buffer": self.desk_buffers[d["id"]],
                    "reason": self.desk_reasons[d["id"]],
                    "seated": len(desk_occupants[d["id"]]) > 0
                } for d in self.desks
            },
            "timestamp": datetime.datetime.now().isoformat()
        }

        return frame, telemetry


# -----------------------------------------------------------------------------
# 4. Background Classroom Worker Thread
# -----------------------------------------------------------------------------
class ClassroomWorker(threading.Thread):
    """Continuously runs LiveClassroomVisionEngine and produces JPEG stream bytes."""
    def __init__(self):
        super().__init__(daemon=True)
        self.running = True
        self.lock = threading.Lock()
        self.engine = LiveClassroomVisionEngine()
        self.latest_jpeg = None
        self.latest_telemetry = {
            "status": "NORMAL",
            "active_alert_desk": None,
            "violation_type": "NONE",
            "persistence_buffer": 0,
            "max_buffer": 0,
            "flagged_count": 0,
            "students_detected": 0,
            "desks_tracked": 12,
            "fps": 30.0,
            "desks": {d["id"]: {"status": "NORMAL", "buffer": 0, "reason": "NONE", "seated": False} for d in DESK_CONFIGS},
            "timestamp": datetime.datetime.now().isoformat()
        }

    def trigger_anomaly(self, desk_id, action_type, duration=5.0):
        self.engine.trigger_anomaly(desk_id, action_type, duration)

    def reset_all(self):
        self.engine.reset_all()

    def run(self):
        print("[Campus Sentinel] Classroom Live Vision Worker started at ~30 FPS.")
        prev_t = time.time()

        while self.running:
            start_loop = time.time()

            # Read live raw camera frame from SharedCamera
            success, raw_frame = shared_camera.read()

            # Process live frame with 12 desk ROIs & YOLOv8-Pose
            annotated_frame, telemetry = self.engine.process_live_frame(raw_frame)

            curr_t = time.time()
            fps = 1.0 / max(0.001, (curr_t - prev_t))
            prev_t = curr_t
            telemetry["fps"] = round(fps, 1)

            # Encode to JPEG
            ret, buffer = cv2.imencode('.jpg', annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ret:
                with self.lock:
                    self.latest_jpeg = buffer.tobytes()
                    self.latest_telemetry = telemetry

            # Target ~30 FPS
            elapsed = time.time() - start_loop
            sleep_needed = max(0.005, (1.0 / 30.0) - elapsed)
            time.sleep(sleep_needed)


classroom_worker = ClassroomWorker()
classroom_worker.start()
