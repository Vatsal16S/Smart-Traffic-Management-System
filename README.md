# AI & IoT Smart Traffic Management System (Adaptive Real-Time Intersection Controller)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Hardware: STM32F407G & Raspberry Pi 5](https://img.shields.io/badge/Hardware-STM32F407G%20%7C%20RPi%205-red.svg)](https://www.st.com/)
[![Edge AI: YOLOv8 / YOLOv10](https://img.shields.io/badge/Model-YOLOv8%20%2F%20YOLOv10-brightgreen.svg)](https://github.com/ultralytics/ultralytics)

An end-to-end intelligent traffic management system engineered to mitigate urban congestion through computer vision, edge AI, adaptive signal allocation algorithms, and dual microcontroller/microprocessor hardware orchestration.

Developed as a Capstone Engineering Project at **MIT World Peace University (MIT-WPU), Pune** by **Vatsal Jha** (B.Tech ECE, SIH National Finalist).

---

## 🚀 Key Highlights & Performance

- **~35% Improved Traffic Response Efficiency**: Replaces obsolete fixed-cycle timers with real-time dynamic queue-length estimation.
- **~30% Reduction in Average Vehicle Waiting Time**: Actuates green phase duration (15s to 50s) dynamically based on approach load.
- **~25% Reduction in False Detections**: Multi-zone Region of Interest (ROI) filtering paired with ByteTrack persistent object ID tracking.
- **Emergency Vehicle Preemption**: Automatic priority detection (Ambulance / Emergency Service) triggering instant green corridors while maintaining intersection clearance safety constraints.
- **Hybrid Real & Simulated Operation**: Operates either connected to live 4-camera/webcam video feeds or in pure deterministic canvas simulation mode.

---

## 🛠️ System Architecture

```text
       [ CAMERA / VIDEO FEEDS ]                  [ YDLIDAR X4 / SENSORS ]
                  │                                         │
                  ▼                                         ▼
   ┌─────────────────────────────┐           ┌─────────────────────────────┐
   │    Raspberry Pi 5 Edge AI   │           │   Hardware LiDAR Driver     │
   │  - YOLOv8/v10 Model Engine  │           │  - 2D Point Cloud Detection │
   │  - ByteTrack ID Association │           │  - Distance & Density Check │
   └──────────────┬──────────────┘           └──────────────┬──────────────┘
                  │                                         │
                  │   UART Serial / WebSocket Telemetry     │
                  └──────────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────┐
                      │    STM32F407G Controller    │
                      │  - Dynamic Signal Logic     │
                      │  - FSM State Transitions    │
                      │  - Relay / LED Matrix Drive │
                      └──────────────┬──────────────┘
                                     │
                                     ▼
                      ┌─────────────────────────────┐
                      │    HTML5 Canvas Dashboard   │
                      │  - Real-time 4-Way Junction │
                      │  - ROI Boundary Overlays    │
                      │  - Metrics & Telemetry HUD  │
                      └─────────────────────────────┘
```

---

## 📁 Repository Structure

```text
├── backend/
│   ├── app.py                     # FastAPI WebSocket streaming server
│   ├── config.yaml                # Camera, ROI, and YOLO pipeline configuration
│   ├── requirements.txt           # Python backend dependencies
│   └── yolo/
│       └── detector.py            # YOLO & ByteTrack frame inference pipeline
├── hardware/
│   ├── stm32/
│   │   └── stm32_traffic_logic.ino # STM32F407G signal controller firmware
│   └── raspberry_pi/
│       ├── pi5_lidar_logic.py     # YDLIDAR X4 point-cloud processing
│       └── pi_uart.py             # High-speed UART interface to STM32
├── simulation-web/
│   ├── index.html                 # Interactive dashboard & canvas UI
│   ├── style.css                  # Dark HUD aesthetic styling
│   ├── launch.py                  # Single-command launcher (Backend + Web Server)
│   ├── serve.py                   # Lightweight local HTTP server
│   └── src/
│       ├── config/                # Intersection geometry & traffic constants
│       ├── detection/             # WebSocket YOLO interface & coordinate mapping
│       ├── simulation/            # Kinematics, vehicle spawning, path curves
│       ├── traffic/               # Adaptive cycle controller & emergency logic
│       └── ui/                    # HUD controls & metric gauges
├── detection/
│   ├── advanced_detection.py      # Standalone multi-lane YOLO detection engine
│   └── vehicle_detection.py       # OpenCV vehicle segmentation script
├── .gitignore
└── README.md
```

---

## ⚙️ Quickstart & Setup Guide

### 1. Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome / Edge / Firefox)
- *(Hardware optional)*: STM32F407G Discovery Board, Raspberry Pi 5, USB-to-UART converter.

### 2. Run the Full Simulator (Web + Backend)
Clone the repository and run the unified launcher:
```bash
git clone https://github.com/vatsal2316/Smart-Traffic-Management-System.git
cd Smart-Traffic-Management-System

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# Launch everything with one command
python simulation-web/launch.py
```
Open your browser to `http://localhost:8080` to interact with the simulation.

### 3. Deploying to Embedded Hardware

#### STM32F407G Firmware
1. Open `hardware/stm32/stm32_traffic_logic.ino` in Arduino IDE (with STM32 core installed) or STM32CubeIDE.
2. Connect STM32F407G via USB/ST-Link.
3. Configure GPIO pins for 4-phase traffic lights:
   - **Phase 1 (North-South)**: Green `PA0`, Yellow `PA1`, Red `PA2`
   - **Phase 2 (East-West)**: Green `PB0`, Yellow `PB1`, Red `PB2`
   - **Phase 3/4**: `PC0`-`PC5`
4. Connect UART RX/TX (`PA9`/`PA10`) to Raspberry Pi 5 pins `GPIO 14` (TXD) and `GPIO 15` (RXD).
5. Compile and flash the firmware.

#### Raspberry Pi 5 LiDAR & Vision Node
```bash
cd hardware/raspberry_pi
python pi_uart.py --port /dev/ttyAMA0 --baud 115200
```

---

## 📊 Live Demonstration Modes

1. **Simulation Mode**: Uses simulated Poisson vehicle arrival distributions to demonstrate the adaptive algorithm's real-time green extension logic against fixed timers.
2. **YOLO Live Mode**: Ingests video frames from RTSP camera streams or USB webcams. Bounding boxes are filtered by polygonal lane ROIs and streamed via WebSockets to calculate real density.
3. **Emergency Preemption Mode**: Click "Spawn Ambulance" or trigger an emergency vehicle detection to observe immediate preemption and red clearance.

---

## 👨‍💻 Author & Project Credits

**Vatsal Jha**  
- **Degree**: B.Tech in Electronics & Communication Engineering (MIT World Peace University, Pune)  
- **Role**: Lead Hardware & Algorithm Developer  
- **Honors**: Smart India Hackathon (SIH) National Finalist  
- **LinkedIn**: [linkedin.com/in/vatsal-jha-966110256](https://www.linkedin.com/in/vatsal-jha-966110256/)  
- **GitHub**: [github.com/vatsal2316](https://github.com/vatsal2316)  
- **Email**: [vatsaljha95@gmail.com](mailto:vatsaljha95@gmail.com)

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
