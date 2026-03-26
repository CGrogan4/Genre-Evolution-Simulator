import csv
import io
import json
import time
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

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

# Master index of all completed runs — used for M3 run summary table
run_index: list[dict] = []


# ---------------------------------------------------------------------------
# Shared models
# ---------------------------------------------------------------------------

class InitParams(BaseModel):
    N:           int   = Field(120,  ge=5,   le=500)
    d:           int   = Field(8,    ge=2,   le=20)
    k:           int   = Field(8,    ge=1,   le=50)
    p:           float = Field(0.03, ge=0.0, le=1.0)
    sigma:       float = Field(0.04, ge=0.0, le=1.0)
    alpha_decay: float = Field(0.3,  ge=0.0, le=1.0)
    seed:        int   = 42


class RunParams(BaseModel):
    """Parameters for a fully automated single run (for M3 documentation)."""
    run_id:      str   = Field(...,  description="Human-readable run ID, e.g. 'run_001'")
    purpose:     str   = Field("",  description="Short description, e.g. 'Baseline'")
    steps:       int   = Field(200, ge=1,   le=5000)
    N:           int   = Field(120,  ge=5,   le=500)
    d:           int   = Field(8,    ge=2,   le=20)
    k:           int   = Field(8,    ge=1,   le=50)
    p:           float = Field(0.03, ge=0.0, le=1.0)
    sigma:       float = Field(0.04, ge=0.0, le=1.0)
    alpha_decay: float = Field(0.3,  ge=0.0, le=1.0)
    seed:        int   = 42


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_frame(eng: SimulationEngine) -> dict:
    """Full frame for the REST/interactive API."""
    base = eng.export_frame()
    base["styles"] = eng.X.tolist()
    base["genres"] = eng.labels.tolist()
    base["tick"]   = base.pop("t")
    return base


def log_to_csv(run_log: list[dict]) -> str:
    """Serialise a run log to a CSV string."""
    if not run_log:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=run_log[0].keys())
    writer.writeheader()
    writer.writerows(run_log)
    return output.getvalue()


# ---------------------------------------------------------------------------
# Basic endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Backend is running!"}


@app.post("/api/init")
def api_init(params: InitParams):
    global engine
    cfg = SimConfig(
        N=params.N,
        d=params.d,
        k=min(params.k, params.N - 1),
        p=params.p,
        sigma=params.sigma,
        alpha_decay=params.alpha_decay,
        seed=params.seed,
    )
    engine = SimulationEngine(cfg)
    return build_frame(engine)


@app.post("/api/step")
def api_step():
    engine.step()
    return build_frame(engine)


# ---------------------------------------------------------------------------
# /api/export  — download current run data as CSV  (M3 data collection)
# ---------------------------------------------------------------------------

@app.get("/api/export/csv")
def export_csv():
    """
    Returns the current engine's run log as a downloadable CSV file.
    Call this after running the simulation to get your M3 data file.
    Each row = one simulation step with metrics:
        tick, unique_genres, largest_genre_n, mean_style_spread, mean_alpha
    """
    run_log = engine.export_run_log()
    if not run_log:
        return JSONResponse(
            status_code=400,
            content={"error": "No data yet — run at least one step first."}
        )

    csv_content = log_to_csv(run_log)
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=run_export.csv"},
    )


@app.get("/api/export/json")
def export_json():
    """
    Returns the current run log as JSON, including the config used.
    Useful for embedding a data sample in your M3 report.
    """
    run_log = engine.export_run_log()
    if not run_log:
        return JSONResponse(
            status_code=400,
            content={"error": "No data yet — run at least one step first."}
        )

    payload = {
        "config": {
            "N":           engine.cfg.N,
            "d":           engine.cfg.d,
            "k":           engine.cfg.k,
            "p":           engine.cfg.p,
            "sigma":       engine.cfg.sigma,
            "alpha_decay": engine.cfg.alpha_decay,
            "seed":        engine.cfg.seed,
        },
        "steps_recorded": len(run_log),
        "run_log": run_log,
    }
    return JSONResponse(content=payload)


# ---------------------------------------------------------------------------
# /api/run  — automated full run  (M3 10-run documentation)
# ---------------------------------------------------------------------------

@app.post("/api/run")
def api_run(params: RunParams):
    """
    Executes a complete simulation run in one call.

    Use this to produce your M3 run table. Example curl:

        curl -X POST http://127.0.0.1:8000/api/run \\
          -H "Content-Type: application/json" \\
          -d '{
            "run_id": "run_001",
            "purpose": "Baseline",
            "steps": 200,
            "N": 120, "d": 8, "k": 8,
            "p": 0.03, "sigma": 0.04,
            "alpha_decay": 0.3, "seed": 42
          }'

    Returns:
        - run metadata (id, purpose, duration, final genre count)
        - full CSV of per-step metrics as a string  (save to run_XXX.csv)
        - final frame snapshot
    """
    global engine

    cfg = SimConfig(
        N=params.N,
        d=params.d,
        k=min(params.k, params.N - 1),
        p=params.p,
        sigma=params.sigma,
        alpha_decay=params.alpha_decay,
        seed=params.seed,
    )
    engine = SimulationEngine(cfg)

    start_time = time.perf_counter()
    for _ in range(params.steps):
        engine.step()
    duration_s = time.perf_counter() - start_time

    run_log  = engine.export_run_log()
    csv_data = log_to_csv(run_log)

    # Final-step summary stats
    final = run_log[-1] if run_log else {}

    summary = {
        "run_id":             params.run_id,
        "purpose":            params.purpose,
        "parameters": {
            "N":           params.N,
            "d":           params.d,
            "k":           params.k,
            "p":           params.p,
            "sigma":       params.sigma,
            "alpha_decay": params.alpha_decay,
            "seed":        params.seed,
        },
        "steps":              params.steps,
        "duration_s":         round(duration_s, 3),
        "final_unique_genres":   final.get("unique_genres"),
        "final_style_spread":    final.get("mean_style_spread"),
        "final_largest_genre_n": final.get("largest_genre_n"),
    }

    # Add to master run index
    run_index.append(summary)

    frame = build_frame(engine)

    return {
        "summary": summary,
        "csv":     csv_data,     # save this as run_XXX.csv for your report
        "frame":   frame,
    }


@app.get("/api/run/index")
def get_run_index():
    """
    Returns a summary table of every /api/run call made this session.
    Use this to build your M3 run summary table.
    """
    return {"runs": run_index, "total": len(run_index)}


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