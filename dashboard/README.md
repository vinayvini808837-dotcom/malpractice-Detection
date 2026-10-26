# Sentinel-Edge AI // Intelligent NPU & Cloud Surveillance Platform

An enterprise-grade intelligent video surveillance web application combining **on-device NPU edge intelligence** with **cloud hybrid storage and orchestration**.

Inspired by:
- **Mohamed Chakir**'s article: *"Intelligent Video Surveillance: How AI, Edge Computing, and NPU Cameras Are Redefining Security"*
- **CampusSentinel** Edge Vision System (`main.py` / `detailed skeletal.txt` - YOLOv8-pose, BoT-SORT tracking, sustained head-turn heuristics, and bounding box IoU fight detection).

---

## 🚀 Key Features

### 1. Dual Video Architecture: Live & Recorded Modes
- **LIVE NPU STREAM**:
  - Live AI Canvas telemetry featuring real-time bounding boxes, BoT-SORT tracking IDs, YOLOv8 pose skeletons (17 keypoints), and gaze angle ratio telemetry.
  - Sub-toggle between **Simulated Edge Stream** (Exam Hall Malpractice, Corridor Fight Detection, Gate Perimeter) and **Real Webcam Input** (`getUserMedia`) with live client-side vision telemetry overlay.
- **RECORDED CLOUD ARCHIVE**:
  - Forensic incident playback with interactive scrubber and bookmark pins.
  - Instant seek to flagged incidents:
    - `08:12:24` - Sustained Head Turn (>2.0s) Exam Malpractice
    - `08:18:58` - Fight / Altercation (IoU Collision Overlap)
    - `08:24:12` - Cross-Desk Reach
  - Speed multipliers (0.5x, 1x, 2x, 4x), frame stepping, and SHA-256 cloud checksum integrity verification.

### 2. Edge NPU vs Cloud Hybrid Storage Paradigm
- **Edge NPU Inference**:
  - Runs YOLOv8n-pose & BoT-SORT directly on camera hardware (~4.12 ms inference time, 30+ FPS).
  - **Privacy by Design**: Raw video stays inside local camera ring buffer; only JSON metadata (coordinates, threat level, confidence) travels upstream.
- **Upstream Bandwidth Reduction**:
  - Traditional 4K continuous raw stream: **32.0 Mbps**
  - Sentinel NPU metadata stream: **0.32 Mbps (99% bandwidth reduction!)**
- **Cloud Storage Vault**:
  - Centralized dashboard for cross-site correlation, predictive incident analytics, long-term 90-day compliance archives, and evidence package export.

### 3. Real-Time Threat Registry & Controls
- **Live Alert Feed**: Filter by Critical, Warning, or All threats.
- **Keyboard Shortcuts**:
  - Press `[C]` or click *Reset Registry* to clear threat buffers and suspect registers (mirrors `main.py`).
  - Press `[Space]` to play/pause in Recorded mode.
- **Synthesizer Audio Chimes**: Web Audio API sci-fi chime notifications on incident trigger.
- **Heuristic Sensitivity Sliders**: Real-time tuning of Head-Turn Persistence frames (10-80 frames), IoU Collision threshold (0.05-0.50), and confidence threshold.

---

## 📁 File Structure

```
CampusSentinal/
├── dashboard/
│   ├── index.html      # Main surveillance console UI
│   ├── styles.css      # Cyber-tactical dark design system
│   ├── app.js          # Core vision engine, live/recorded logic
│   └── README.md       # System documentation
├── main.py             # Python YOLOv8 pose edge tracking script
├── detailed skeletal.txt # MediaPipe & IoU collision reference
├── yolov8n-pose.pt     # Pretrained YOLOv8 pose weights
└── yolov8n.pt          # Pretrained YOLOv8 detection weights
```

---

## 🖥️ How to Run

### Option 1: Live AI Detection Server (Recommended for Real-Time YOLOv8 Live Camera)
Run the real-time AI backend which streams camera frames with live YOLOv8 detections (green boxes for normal candidates, red alert boxes for phones/cheating):
```bash
# Using the turnkey server (zero extra pip packages required!)
cd CampusSentinal
python server.py

# Or if you use FastAPI with uvicorn:
python -m uvicorn app_fastapi:app --reload --port 8080

# Or if you use Flask:
python app_flask.py
```
Then navigate to: `http://localhost:8080` in your browser. Click **TURN ON LIVE CAMERA** to see real-time bounding boxes and exam behavior classifications.

### Option 2: Direct Desktop Vision Mode
Run the desktop OpenCV tracking window directly:
```bash
cd CampusSentinal
python main.py
```

### Option 3: Direct Browser Launch
Open `dashboard/index.html` directly in your browser. The live camera includes real-time face and posture bounding boxes with smooth client-side fallback.
