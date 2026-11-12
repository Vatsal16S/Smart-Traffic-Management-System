"""
detector.py — High-performance multi-direction YOLOv10 detector for Capstone Traffic Simulation.
Loads a single shared YOLOv10 model once at startup, initializes all 4 direction cameras
with initial frames and bounding boxes, and streams real-time updates over WebSocket.
"""

import cv2
import time
import base64
import yaml
import asyncio
import threading
import torch
import numpy as np
from ultralytics import YOLO
import ultralytics.nn.tasks

# Fix for PyTorch 2.6+ weights_only breaking changes
try:
    torch.serialization.add_safe_globals([ultralytics.nn.tasks.DetectionModel])
except AttributeError:
    pass

VEHICLE_CLASSES = {2, 3, 5, 7}

COLOR_MAP = {
    "car": (59, 130, 246),
    "motorcycle": (234, 179, 8),
    "autorickshaw": (249, 115, 22),
    "bus": (34, 197, 94),
    "truck": (168, 85, 247),
    "ambulance": (239, 68, 68),
}

def classify_vehicle(cls_id: int, w_norm: float, h_norm: float) -> str | None:
    """Return canonical vehicle class name, or None if class is not a vehicle."""
    if cls_id == 2:
        aspect = w_norm / h_norm if h_norm > 0 else 1.0
        area = w_norm * h_norm
        return "autorickshaw" if (0.005 <= area <= 0.012 and aspect > 0.80) else "car"
    elif cls_id == 3:
        return "motorcycle"
    elif cls_id == 5:
        return "bus"
    elif cls_id == 7:
        return "truck"
    return None

class DirectionWorker:
    """
    Owns one cv2.VideoCapture and uses the shared pre-loaded YOLO model.
    Runs inference on green signal and maintains stable bounding boxes and base64 video frame.
    """
    def __init__(self, direction: str, source: str, model: YOLO, model_lock: threading.Lock,
                 cfg: dict, signal_states: dict):
        self.direction = direction
        self.source = source
        self.model = model
        self.model_lock = model_lock
        self.cfg = cfg
        self.signal_states = signal_states

        self._lock = threading.Lock()
        self._result = {
            "detections": [],
            "roi_count": 0,
            "class_breakdown": {},
            "fps": 0.0,
            "latency_ms": 0,
            "frame_b64": "",
            "roi_coords": cfg.get("roi", {}).get(direction, [0.0, 0.0, 1.0, 1.0]),
            "healthy": False,
            "timestamp": 0.0,
            "signal": "red",
        }

        self._running = False
        self._thread = None
        self._frame_times: list[float] = []

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"worker-{self.direction}")
        self._thread.start()

    def stop(self):
        self._running = False

    def get_result(self) -> dict:
        with self._lock:
            return dict(self._result)

    def _infer_and_store(self, frame: np.ndarray, roi_norm: list[float], t_start: float = 0.0, is_initial: bool = False):
        fh, fw = frame.shape[:2]
        rx0, ry0 = int(roi_norm[0] * fw), int(roi_norm[1] * fh)
        rx1, ry1 = int(roi_norm[2] * fw), int(roi_norm[3] * fh)

        # Draw ROI overlay on frame
        cv2.rectangle(frame, (rx0, ry0), (rx1, ry1), (0, 255, 255), 2)
        cv2.putText(frame, f"ROI-{self.direction.upper()}", (rx0 + 5, ry0 - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1)

        # Run inference using shared model under thread lock
        try:
            with self.model_lock:
                results = self.model.track(
                    frame,
                    persist=True,
                    tracker=self.cfg.get("tracker", "bytetrack.yaml"),
                    conf=self.cfg.get("confidence_threshold", 0.25),
                    iou=self.cfg.get("iou_threshold", 0.45),
                    imgsz=self.cfg.get("input_resolution", 416),
                    verbose=False
                )
        except Exception as e:
            # Fallback to standard predict if track fails
            try:
                with self.model_lock:
                    results = self.model.predict(
                        frame,
                        conf=self.cfg.get("confidence_threshold", 0.25),
                        iou=self.cfg.get("iou_threshold", 0.45),
                        imgsz=self.cfg.get("input_resolution", 416),
                        verbose=False
                    )
            except Exception as e2:
                print(f"[{self.direction}] Inference error: {e2}")
                return

        detections = []
        class_breakdown = {}
        roi_count = 0

        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            for i in range(len(boxes)):
                box = boxes[i]
                track_id = int(box.id[0].item()) if (hasattr(box, "id") and box.id is not None) else (i + 1)
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                cx, cy, bw, bh = box.xywhn[0].tolist()

                vtype = classify_vehicle(cls_id, bw, bh)
                if vtype is None:
                    continue

                color = COLOR_MAP.get(vtype, (255, 255, 255))
                px1 = int((cx - bw / 2) * fw)
                py1 = int((cy - bh / 2) * fh)
                px2 = int((cx + bw / 2) * fw)
                py2 = int((cy + bh / 2) * fh)
                cv2.rectangle(frame, (px1, py1), (px2, py2), color, 2)
                label = f"{vtype[:3]}#{track_id} {conf:.0%}"
                cv2.putText(frame, label, (px1, py1 - 4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

                bc_x_norm = cx
                bc_y_norm = cy + bh / 2.0
                in_roi = (roi_norm[0] <= bc_x_norm <= roi_norm[2] and
                          roi_norm[1] <= bc_y_norm <= roi_norm[3])

                det = {
                    "vehicle_id": f"{self.direction}_{track_id}",
                    "vehicle_type": vtype,
                    "confidence": round(conf, 2),
                    "approach": self.direction,
                    "track_id": track_id,
                    "x": cx,
                    "y": cy,
                    "width": bw,
                    "height": bh,
                    "in_roi": in_roi,
                }
                detections.append(det)

                if in_roi:
                    roi_count += 1
                    class_breakdown[vtype] = class_breakdown.get(vtype, 0) + 1

        # Resize and encode to base64 JPEG
        display_frame = cv2.resize(frame, (320, 240))
        _, buf = cv2.imencode(".jpg", display_frame, [cv2.IMWRITE_JPEG_QUALITY, 55])
        frame_b64 = base64.b64encode(buf).decode("utf-8")

        latency_ms = int((time.monotonic() - t_start) * 1000) if t_start > 0 else 45

        now = time.monotonic()
        self._frame_times.append(now)
        if len(self._frame_times) > 10:
            self._frame_times.pop(0)
        fps = round((len(self._frame_times) - 1) / (self._frame_times[-1] - self._frame_times[0]), 1) if len(self._frame_times) >= 2 else 10.0

        current_sig = self.signal_states.get(self.direction, "red")

        with self._lock:
            self._result = {
                "detections": detections,
                "roi_count": roi_count,
                "class_breakdown": class_breakdown,
                "fps": fps,
                "latency_ms": latency_ms,
                "frame_b64": frame_b64,
                "roi_coords": roi_norm,
                "healthy": True,
                "signal": current_sig,
                "timestamp": time.time(),
            }

    def _run(self):
        roi_norm = self.cfg.get("roi", {}).get(self.direction, [0.0, 0.0, 1.0, 1.0])
        cap = cv2.VideoCapture(self.source)
        if not cap.isOpened():
            print(f"[{self.direction}] Cannot open video source: {self.source}")
            return

        # Perform initial frame read and inference so camera tile starts populated immediately
        success, frame = cap.read()
        if success and frame is not None:
            self._infer_and_store(frame, roi_norm, is_initial=True)
            print(f"[{self.direction}] Initial frame processed and ready!")

        while self._running:
            t_start = time.monotonic()
            success, frame = cap.read()
            if not success:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                success, frame = cap.read()

            if not success or frame is None:
                time.sleep(0.04)
                continue

            self._infer_and_store(frame, roi_norm, t_start=t_start)
            time.sleep(0.02)

        cap.release()

class YoloDetector:
    def __init__(self, config_path="config.yaml"):
        with open(config_path, "r") as f:
            self.config = yaml.safe_load(f)["yolo"]

        self._workers: dict[str, DirectionWorker] = {}
        self.running = False
        self.model_lock = threading.Lock()

        print(f"Loading shared YOLO model: {self.config['model_path']} ...")
        t0 = time.time()
        self.model = YOLO(self.config["model_path"])
        
        # JIT Warmup
        dummy = np.zeros((self.config.get("input_resolution", 416), self.config.get("input_resolution", 416), 3), dtype=np.uint8)
        try:
            self.model.predict(dummy, imgsz=self.config.get("input_resolution", 416), verbose=False)
        except Exception:
            pass
            
        print(f"Shared YOLO model loaded and warmed up in {time.time() - t0:.2f}s!")

        self.signal_states = {
            "north": "green",
            "east": "red",
            "south": "red",
            "west": "red",
        }

    def start_videos(self):
        if self.running:
            return
        self.running = True
        sources = self.config["sources"]
        print(f"Starting {len(sources)} camera direction workers...")
        for direction, source in sources.items():
            worker = DirectionWorker(
                direction=direction,
                source=source,
                model=self.model,
                model_lock=self.model_lock,
                cfg=self.config,
                signal_states=self.signal_states,
            )
            worker.start()
            self._workers[direction] = worker
        print(f"All {len(self._workers)} direction workers started and running!")

    def stop_videos(self):
        self.running = False
        for w in self._workers.values():
            w.stop()
        self._workers.clear()
        print("All direction workers stopped.")

    def update_signals(self, states: dict):
        if isinstance(states, dict):
            for k, v in states.items():
                if k in self.signal_states:
                    self.signal_states[k] = v

    async def generate_frames(self):
        if not self._workers:
            return

        stale_timeout = float(self.config.get("stale_timeout_s", 5.0))
        frame_id = 0

        while self.running:
            frame_id += 1
            now = time.time()

            directions_data = {}
            all_detections = []

            for direction, worker in self._workers.items():
                r = worker.get_result()
                age = now - r["timestamp"] if r["timestamp"] > 0 else stale_timeout + 1
                healthy = r["healthy"] and age < stale_timeout

                directions_data[direction] = {
                    "detections": r["detections"],
                    "roi_count": r["roi_count"],
                    "class_breakdown": r["class_breakdown"],
                    "fps": r["fps"],
                    "latency_ms": r["latency_ms"],
                    "roi_coords": r["roi_coords"],
                    "frame_b64": r["frame_b64"],
                    "healthy": healthy,
                    "timestamp": r["timestamp"],
                    "age_ms": round(age * 1000),
                }
                all_detections.extend(r["detections"])

            total_tracked = len(all_detections)
            healthy_dirs = [d for d in directions_data.values() if d["healthy"]]
            avg_fps = round(sum(d["fps"] for d in healthy_dirs) / len(healthy_dirs), 1) if healthy_dirs else 0.0
            avg_latency = round(sum(d["latency_ms"] for d in healthy_dirs) / len(healthy_dirs)) if healthy_dirs else 0

            payload = {
                "timestamp": now,
                "frame_id": frame_id,
                "fps": avg_fps,
                "latency_ms": avg_latency,
                "tracked": total_tracked,
                "directions": directions_data,
                "detections": all_detections,
            }

            yield payload
            await asyncio.sleep(0.08)
