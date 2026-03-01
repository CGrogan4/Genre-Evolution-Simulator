from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import asyncio
from sim.engine import SimulationEngine
from sim.config import SimConfig

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SimulationEngine(SimConfig())
clients: set[WebSocket] = set()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_frame(eng: SimulationEngine) -> dict:
    """Return a full frame including styles and genres for the REST API."""
    base = eng.export_frame()          # {t, nodes, links}
    base["styles"] = eng.X.tolist()    # (N, d) raw style vectors
    base["genres"] = eng.labels.tolist()
    base["tick"] = base.pop("t")       # rename t -> tick to match frontend
    return base


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

class InitParams(BaseModel):
    num_artists: int = Field(120, ge=5, le=500)
    style_dim: int = Field(8, ge=2, le=20)
    avg_degree: int = Field(8, ge=1, le=50)
    alpha: float = Field(0.25, ge=0.0, le=1.0)   # maps to p (innovation prob)
    noise: float = Field(0.04, ge=0.0, le=1.0)   # maps to sigma
    seed: int = 42


@app.get("/")
def root():
    return {"message": "Backend is running!"}


@app.post("/api/init")
def api_init(params: InitParams):
    global engine
    cfg = SimConfig(
        N=params.num_artists,
        d=params.style_dim,
        k=min(params.avg_degree, params.num_artists - 1),
        p=params.alpha,
        sigma=params.noise,
    )
    engine = SimulationEngine(cfg)
    return build_frame(engine)


@app.post("/api/step")
def api_step():
    engine.step()
    return build_frame(engine)


# ---------------------------------------------------------------------------
# WebSocket (kept for compatibility)
# ---------------------------------------------------------------------------

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

    await ws.send_json(engine.export_frame())

    async def sim_loop():
        nonlocal running, tick_ms
        while True:
            if running and clients:
                engine.step()
                await broadcast(engine.export_frame())
                await asyncio.sleep(tick_ms / 1000.0)
            else:
                await asyncio.sleep(0.05)

    loop_task = asyncio.create_task(sim_loop())

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
    except WebSocketDisconnect:
        clients.discard(ws)
    finally:
        loop_task.cancel()