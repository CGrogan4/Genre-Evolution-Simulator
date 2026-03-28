# Music Genre Evolution Simulator

A real-time simulation of music genre evolution using network dynamics and influence-based style updates. Artists are modeled as nodes in a small-world influence network, and genre clusters emerge organically through local interactions — no genres are predefined or hardcoded.

---

## How It Works

Each artist is a point in an 8-dimensional **style space** where every dimension represents an abstract musical attribute (energy, tempo, harmonic complexity, etc.). At each tick, "artists" are pulled toward their neighbors' styles through a weighted influence equation:

```
X_i(t+1) = (1 - α_i) · X_i(t) + α_i · Σ w_ij · X_j(t) + noise
```

- **α_i** — artist susceptibility to influence (higher = more easily swayed)
- **w_ij** — normalized influence weight from artist j to artist i
- **noise** — random creative jump with probability p, magnitude σ

Artists that cluster together in style space are automatically grouped into genres using **DBSCAN** (Density-Based Spatial Clustering). The network is a **Watts-Strogatz small-world graph** with configurable average degree and rewiring probability, which creates the "shortcuts" between distant artists that mimic viral cultural moments.

---

## Features

- Real-time simulation with Play / Pause / Step controls
- 2D style projection using Principal Component Analysis — shows the two directions of maximum variance in style space
- Genre cluster detection via **DBSCAN** — no fixed number of genres required
- **Influence Leaderboard** — ranks artists by betweenness centrality (bridge artists between genres)
- Fully parameterized — all simulation variables adjustable from the UI
- Parameter validation with descriptive error messages
- Automated data collection — metrics logged every tick
- **CSV and JSON export** of full run logs with timestamps
- Automated full-run API endpoint for batch documentation
- Info modals on every parameter explaining the math behind it
- Responsive layout — works on any screen size

---

## Project Structure

```
Genre-Evolution-Simulator/
├── backend/
│   ├── main.py              # FastAPI app — REST + WebSocket endpoints
│   ├── requirements.txt
│   └── sim/
│       ├── engine.py        # Core simulation logic
│       └── config.py        # SimConfig dataclass with all defaults
└── music-react/
    ├── src/
    │   ├── App.jsx           # Main UI — state, controls, layout
    │   └── components/
│       ├── ScatterPlot2D.jsx # PCA scatter plot with genre trails
    │       └── GenreStats.jsx    # Genre cluster bars + influence leaderboard
    └── index.css
```

---

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Artists (N) | 50 | Number of artist nodes. More artists = more stable minority genres |
| Style Dimensions (d) | 3 | Dimensionality of style space. Higher = harder to converge |
| Avg Degree (k) | 4 | Average network connections per artist. Higher = faster diffusion |
| Innovation Prob (p) | 0.03 | Probability of a random creative jump per tick |
| Innovation Noise (σ) | 0.04 | Magnitude of creative jumps when they occur |
| Alpha Decay | 0.3 | Reduces susceptibility for well-connected artists |
| Seed | 42 | Random seed for full reproducibility |
| Step (ms) | 400 | Display speed — does not affect simulation math |

### Parameter Regimes

| Setting | Behavior |
|---------|----------|
| High alpha decay, low p | Slow convergence, genres persist longer |
| Low alpha decay, high p | Rapid convergence, one genre dominates quickly |
| High σ (0.1–0.3) | Genres fragment and recombine frequently |
| High N (150+) | Multiple stable genres coexist longer |

---

## Data Collection

Every simulation tick automatically records:

| Field | Description |
|-------|-------------|
| `timestamp` | UTC wall-clock time of the recording |
| `tick` | Simulation step number |
| `unique_genres` | Number of active genre clusters |
| `largest_genre_n` | Artist count in the dominant genre |
| `mean_style_spread` | Average standard deviation across style dimensions |
| `mean_alpha` | Average artist susceptibility |

Export the current run at any time via `http://127.0.0.1:8000/api/export/csv`.

---

## Changes from Original Proposal

| Original | Current | Reason |
|----------|---------|--------|
| K-means clustering | DBSCAN | DBSCAN requires no fixed genre count — genres emerge naturally |
| WebSocket-only architecture | REST + WebSocket | REST endpoints enable automated batch runs for data collection |
| 3D force-directed network | PCA 2D scatter plot | PCA projection better shows style-space clustering and genre drift |
| No data export | CSV + JSON export with timestamps | Required for systematic run documentation |
| Global `np.random` calls | Seeded `np.random.default_rng` | Full reproducibility — same seed always produces identical results |

---

## Architecture

### Backend (`engine.py`)
- `SimulationEngine` — manages artist styles, network, clustering, and metrics
- `_cluster_labels()` — DBSCAN genre detection, runs every 10 ticks
- `_compute_betweenness()` — betweenness centrality for influence ranking, runs every 50 ticks
- `export_frame()` — PCA projection + node/link data for the frontend
- `export_run_log()` — returns timestamped per-step metrics for CSV/JSON export

### Frontend
- `App.jsx` — parameter state, validation, API calls, responsive layout
- `ScatterPlot2D.jsx` — PCA scatter plot with genre color legend, cluster labels, movement trails, and influence-scaled dot sizes
- `GenreStats.jsx` — genre cluster bar chart and betweenness centrality leaderboard

---

## Summary

This project models cultural evolution as an emergent process driven by local interactions within a dynamic network. It integrates computational modeling, real-time visualization, and systematic data collection to explore how genres form, compete, and collapse without centralized control — a direct implementation of self-organization principles from complex systems theory.
