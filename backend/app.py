import json
import asyncio
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from yolo.detector import YoloDetector

app = FastAPI(title="YOLOv10 Traffic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared detector initialized and pre-warmed at server launch
detector = YoloDetector(config_path="config.yaml")
detector.start_videos()

@app.get("/")
def read_root():
    return {
        "status": "YOLO Backend is Running",
        "model": detector.config["model_path"],
        "sources": detector.config["sources"],
    }

@app.websocket("/ws/video")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    async def receive_states():
        """Accepts traffic-light state updates from frontend."""
        try:
            while True:
                text = await websocket.receive_text()
                if text.startswith("STATES:"):
                    try:
                        states = json.loads(text[7:])
                        detector.update_signals(states)
                    except json.JSONDecodeError:
                        pass
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    receiver_task = asyncio.create_task(receive_states())

    try:
        async for payload in detector.generate_frames():
            await websocket.send_json(payload)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket client disconnected: {e}")
    finally:
        receiver_task.cancel()

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
