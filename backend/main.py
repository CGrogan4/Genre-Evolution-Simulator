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
        "https://genre-evolution-simulator-front.onrender.com", "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = SimulationEngine(SimConfig())
clients: set[WebSocket] = set()
run_index: list[dict] = []


# ---------------------------------------------------------------------------
# Models
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
    run_id:      str   = Field(...,  description="e.g. 'run_001'")
    purpose:     str   = Field("",  description="e.g. 'Baseline'")
    steps:       int   = Field(200, ge=1,   le=5000)
    N:           int   = Field(120,  ge=5,   le=500)
    d:           int   = Field(8,    ge=2,   le=20)
    k:           int   = Field(8,    ge=1,   le=50)
    p:           float = Field(0.03, ge=0.0, le=1.0)
    sigma:       float = Field(0.04, ge=0.0, le=1.0)
    alpha_decay: float = Field(0.3,  ge=0.0, le=1.0)
    seed:        int   = 42

class SensitivityParams(BaseModel):
    parameter:   str   = Field(..., description="Parameter to vary: 'p', 'sigma', 'k', 'N', 'alpha_decay'")
    values:      list[float] = Field(..., description="List of values to test")
    steps:       int   = Field(200, ge=1, le=5000)
    N:           int   = Field(50,  ge=5, le=500)
    d:           int   = Field(3,   ge=2, le=20)
    k:           int   = Field(4,   ge=1, le=50)
    p:           float = Field(0.03, ge=0.0, le=1.0)
    sigma:       float = Field(0.04, ge=0.0, le=1.0)
    alpha_decay: float = Field(0.3,  ge=0.0, le=1.0)
    seed:        int   = 42


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_frame(eng: SimulationEngine) -> dict:
    base = eng.export_frame()
    base["styles"] = eng.X.tolist()
    base["genres"] = eng.labels.tolist()
    base["tick"]   = base.pop("t")
    return base


def log_to_csv(rows: list[dict]) -> str:
    if not rows:
        return ""
    # Collect all possible keys across all rows (per-genre counts vary)
    all_keys: list[str] = []
    seen = set()
    for row in rows:
        for k in row:
            if k not in seen:
                all_keys.append(k)
                seen.add(k)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=all_keys, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k, "") for k in all_keys})
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
# Export endpoints
# ---------------------------------------------------------------------------


@app.post("/api/sensitivity")
def api_sensitivity(params: SensitivityParams):
    """
    Runs the simulation once per value in params.values,
    varying only the specified parameter and holding all others constant.
    Returns a summary row per run for easy comparison.
    """
    global engine
    results = []

    for val in params.values:
        cfg_kwargs = {
            "N":           params.N,
            "d":           params.d,
            "k":           min(params.k, params.N - 1),
            "p":           params.p,
            "sigma":       params.sigma,
            "alpha_decay": params.alpha_decay,
            "seed":        params.seed,
        }

        if params.parameter in ("k", "N", "d"):
            cfg_kwargs[params.parameter] = int(val)
        else:
            cfg_kwargs[params.parameter] = val

        if params.parameter == "k":
            cfg_kwargs["k"] = min(cfg_kwargs["k"], cfg_kwargs["N"] - 1)

        cfg = SimConfig(**cfg_kwargs)
        engine = SimulationEngine(cfg)

        start_time = time.perf_counter()
        for _ in range(params.steps):
            engine.step()
        duration_s = time.perf_counter() - start_time

        summary = engine.export_summary()
        results.append({
            "parameter":       params.parameter,
            "value":           val,
            "duration_s":      round(duration_s, 3),
            "final_genres":    summary.get("final_unique_genres"),
            "peak_dom_tick":   summary.get("peak_dominance_tick"),
            "final_spread":    summary.get("final_mean_style_spread"),
            "avg_spread":      summary.get("avg_style_spread"),
            "innov_rate":      summary.get("innovation_rate_per_tick"),
            "transition_rate": summary.get("transition_rate_per_tick"),
        })

    return {"parameter": params.parameter, "results": results}

@app.get("/api/export/csv")
def export_timeseries_csv():
    """
    Download the time-series run log as CSV.
    One row per tick. Columns: timestamp, tick, unique_genres,
    largest_genre_n, mean_style_spread, network_utilization,
    innovations_this_tick, genre_transitions_this_tick,
    total_innovations, total_genre_transitions, per-genre counts, etc.
    """
    rows = engine.export_run_log()
    if not rows:
        return JSONResponse(status_code=400, content={"error": "No data yet."})
    return StreamingResponse(
        io.StringIO(log_to_csv(rows)),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timeseries.csv"},
    )


@app.get("/api/export/events/csv")
def export_events_csv():
    """
    Download the event log as CSV.
    One row per discrete event: innovations, genre transitions,
    genre absorptions, genre emergences.
    Each row has: timestamp, tick, event_type, artist_id, description.
    """
    rows = engine.export_event_log()
    if not rows:
        return JSONResponse(status_code=400, content={"error": "No events yet."})
    return StreamingResponse(
        io.StringIO(log_to_csv(rows)),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=events.csv"},
    )


@app.get("/api/export/summary")
def export_summary():
    """
    Returns aggregate summary statistics for the current run:
    averages, max/min observations, total counts, throughput rates,
    and event type breakdown.
    """
    summary = engine.export_summary()
    if not summary:
        return JSONResponse(status_code=400, content={"error": "No data yet."})
    return JSONResponse(content={
        "config": {
            "N":           engine.cfg.N,
            "d":           engine.cfg.d,
            "k":           engine.cfg.k,
            "p":           engine.cfg.p,
            "sigma":       engine.cfg.sigma,
            "alpha_decay": engine.cfg.alpha_decay,
            "seed":        engine.cfg.seed,
        },
        "summary": summary,
    })


@app.get("/api/export/json")
def export_json():
    """Full run log as JSON including config."""
    rows = engine.export_run_log()
    if not rows:
        return JSONResponse(status_code=400, content={"error": "No data yet."})
    return JSONResponse(content={
        "config": {
            "N":           engine.cfg.N,
            "d":           engine.cfg.d,
            "k":           engine.cfg.k,
            "p":           engine.cfg.p,
            "sigma":       engine.cfg.sigma,
            "alpha_decay": engine.cfg.alpha_decay,
            "seed":        engine.cfg.seed,
        },
        "steps_recorded": len(rows),
        "run_log": rows,
    })


# ---------------------------------------------------------------------------
# Automated run endpoint
# ---------------------------------------------------------------------------

@app.post("/api/run")
def api_run(params: RunParams):
    """
    Executes a complete simulation run in one call.
    Returns summary stats, time-series CSV, event CSV, and final frame.
    Use this to produce your M3 run table.
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

    summary    = engine.export_summary()
    timeseries = log_to_csv(engine.export_run_log())
    events     = log_to_csv(engine.export_event_log())

    run_summary = {
        "run_id":          params.run_id,
        "purpose":         params.purpose,
        "parameters": {
            "N":           params.N,
            "d":           params.d,
            "k":           params.k,
            "p":           params.p,
            "sigma":       params.sigma,
            "alpha_decay": params.alpha_decay,
            "seed":        params.seed,
        },
        "steps":           params.steps,
        "duration_s":      round(duration_s, 3),
        **summary,
    }

    run_index.append(run_summary)

    return {
        "summary":    run_summary,
        "timeseries": timeseries,   # save as run_XXX_timeseries.csv
        "events":     events,        # save as run_XXX_events.csv
        "frame":      build_frame(engine),
    }


@app.get("/api/run/index")
def get_run_index():
    """Summary table of every /api/run call this session."""
    return {"runs": run_index, "total": len(run_index)}


# ---------------------------------------------------------------------------
# WebSocket
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