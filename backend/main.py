from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio

from sim.engine import SimulationEngine
from sim.config import SimConfig

app = FastAPI()

# allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SimulationEngine(SimConfig())
clients: set[WebSocket] = set()

@app.get("/")
def root():
    return {"message": "Backend is running!"}

async def broadcast(payload: dict):
    dead = []
    for ws in clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)

    running = False
    tick_ms = 200

    # initial frame
    await ws.send_json(engine.export_frame())

    try:
        while True:
            msg = await ws.receive_json()
            t = msg.get("type")

            if t == "step":
                engine.step()
                await broadcast(engine.export_frame())

            elif t == "play":
                running = True

            elif t == "pause":
                running = False

            elif t == "set_params":
                engine.update_params(msg.get("params", {}))

            elif t == "set_speed":
                tick_ms = int(msg.get("tick_ms", tick_ms))

            while running and clients:
                engine.step()
                await broadcast(engine.export_frame())
                await asyncio.sleep(tick_ms / 1000.0)

    except WebSocketDisconnect:
        clients.discard(ws)