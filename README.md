# Music Genre Evolution Simulator

A real-time simulation of music genre evolution using network dynamics and influence-based style updates. Artists are modeled as nodes in a small-world influence network, and genre clusters emerge organically through local interactions — no genres are predefined or hardcoded.

**Live Demo:** https://genre-evolution-simulator-front.onrender.com  
**Backend API Docs:** https://genre-evolution-simulator.onrender.com/docs

---

## How It Works

Each artist is a point in an 8-dimensional **style space** where every dimension represents an abstract musical attribute (energy, tempo, harmonic complexity, etc.). At each tick, artists are pulled toward their neighbors' styles through a weighted influence equation:

```
X_i(t+1) = (1 - α_i) · X_i(t) + α_i · Σ w_ij · X_j(t) + noise
```

- **α_i** — artist susceptibility to influence (higher = more easily swayed)
- **w_ij** — normalized influence weight from artist j to artist i
- **noise** — random creative jump with probability p, magnitude σ

Artists that cluster together in style space are automatically grouped into genres using **DBSCAN** (Density-Based Spatial Clustering). The network is a **Watts-Strogatz small-world graph** with configurable average degree and rewiring probability, which creates shortcuts between distant artists that mimic viral cultural moments.

### Theoretical Foundation

The influence update equation is based on the **DeGroot learning model** (DeGroot, 1974), which describes how agents update beliefs by averaging the opinions of their neighbors. The network structure uses the **Watts-Strogatz small-world model** (Watts & Strogatz, 1998), which generates networks with high local clustering and short average path lengths simultaneously — the same properties observed in real social networks.

---

## Features

- Real-time simulation with Play / Pause / Step controls
- 2D style projection using Principal Component Analysis — shows the two directions of maximum variance in style space
- Genre cluster detection via **DBSCAN** — no fixed number of genres required
- **Influence Leaderboard** — ranks artists by betweenness centrality (bridge artists between genres)
- **Artist Heterogeneity** — three artist types with distinct influence and susceptibility profiles
- Fully parameterized — all simulation variables adjustable from the UI
- Parameter validation with descriptive error messages
- Automated data collection — metrics logged every tick
- **CSV and JSON export** of full run logs with timestamps
- Sensitivity sweep endpoint for systematic parameter analysis
- Automated full-run API endpoint for batch documentation
- Info modals on every parameter explaining the math behind it
- Responsive layout — works on any screen size

---

## Artist Types

The simulation assigns each artist one of three types at initialization, modeling the heterogeneity of real music ecosystems:

| Type | Proportion | Susceptibility (α) | Influence Weight | Behavior |
|------|-----------|-------------------|-----------------|----------|
| Tastemaker | 15% | 0.05 – 0.20 | 2.5× | Leads trends — resists peer influence, pulls others strongly |
| Mainstream | 60% | 0.15 – 0.50 | 1.0× | Average behavior — baseline susceptibility and influence |
| Niche | 25% | 0.35 – 0.70 | 0.4× | Follows trends — highly susceptible, low outgoing influence |

Artist type is visible in the Data Preview panel (`artist_type` field: 0 = tastemaker, 1 = mainstream, 2 = niche) and is exported with every frame.

---

## Project Structure

```
Genre-Evolution-Simulator/
├── backend/
│   ├── main.py              # FastAPI app — REST + WebSocket endpoints
│   ├── requirements.txt
│   └── sim/
│       ├── engine.py        # Core simulation logic + artist heterogeneity
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

## Parameters

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
| p > 0.12 and σ > 0.08 | Sustained genre diversity — multiple genres persist |
| p < 0.08 or σ < 0.04 | Convergence to single genre within 200 ticks |
| High σ (0.15–0.25) | Genres fragment and recombine frequently |
| k = 2 (sparse) | 3 genres sustained — isolated clusters resist absorption |
| k ≥ 10 (dense) | Fast convergence — influence spreads too quickly for diversity |
| p = 1 | System never converges — sustained maximum fragmentation |

---

## Key Findings (Analysis)

Systematic sensitivity analysis across 31 runs identified the following:

- **p threshold:** genre count jumps from 1 to 2 between p=0.08 and p=0.12
- **σ threshold:** genre count jumps from 1 to 2 between σ=0.04 and σ=0.08; σ produces a 17x range in final style spread (0.006 to 0.111)
- **Superadditive behavior:** p=0.12 alone → 2 genres, σ=0.20 alone → 2 genres, both together → 3 genres
- **Network degree:** non-monotonic — sparse (k=2) sustains 3 genres, intermediate (k=6–8) sustains 2, dense (k≥10) converges to 1
- **Three-phase structure:** genre evolution proceeds through early fragmentation (mean smallest genre = 3.2), mid-run fluctuation (8.4), and late stabilization (13.7)
- **Extreme boundaries:** p=0 converges via peer influence alone; p=1 never converges

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/init` | Initialize simulation with parameters |
| POST | `/api/step` | Advance simulation one tick |
| POST | `/api/run` | Execute a complete named run and return summary + CSV |
| POST | `/api/sensitivity` | Sweep one parameter across a list of values |
| GET | `/api/export/csv` | Download timeseries as CSV |
| GET | `/api/export/events/csv` | Download event log as CSV |
| GET | `/api/export/summary` | Aggregate run statistics as JSON |
| GET | `/api/export/json` | Full run log as JSON |
| GET | `/api/run/index` | Summary table of all /api/run calls this session |

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
| `mean_alpha_tastemaker` | Mean alpha for tastemaker artists |
| `mean_alpha_mainstream` | Mean alpha for mainstream artists |
| `mean_alpha_niche` | Mean alpha for niche artists |
| `innovations_this_tick` | Number of creative jumps this tick |
| `genre_transitions_this_tick` | Number of artists that changed genre |

---

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd music-react
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. Backend API docs at `http://localhost:8000/docs`.

---

## Changes from Original Proposal

| Original | Current | Reason |
|----------|---------|--------|
| K-means clustering | DBSCAN | DBSCAN requires no fixed genre count — genres emerge naturally |
| WebSocket-only architecture | REST + WebSocket | REST endpoints enable automated batch runs for data collection |
| 3D force-directed network | PCA 2D scatter plot | PCA projection better shows style-space clustering and genre drift |
| No data export | CSV + JSON export with timestamps | Required for systematic run documentation |
| Global `np.random` calls | Seeded `np.random.default_rng` | Full reproducibility — same seed always produces identical results |
| Homogeneous artists | Three artist types (tastemaker / mainstream / niche) | Models real heterogeneity in music ecosystems |

---

## Architecture

### Backend (`engine.py`)
- `SimulationEngine` — manages artist styles, network, clustering, metrics, and artist types
- `_assign_artist_types()` — assigns tastemaker / mainstream / niche at initialization
- `_init_alpha_by_type()` — draws susceptibility from type-specific ranges
- `_cluster_labels()` — DBSCAN genre detection, runs every 10 ticks
- `_compute_betweenness()` — betweenness centrality for influence ranking, runs every 50 ticks
- `export_frame()` — PCA projection + node/link data including artist_type per node
- `export_run_log()` — returns timestamped per-step metrics for CSV/JSON export

### Frontend
- `App.jsx` — parameter state, validation, API calls, responsive layout
- `ScatterPlot2D.jsx` — PCA scatter plot with genre color legend, cluster labels, movement trails, and influence-scaled dot sizes
- `GenreStats.jsx` — genre cluster bar chart and betweenness centrality leaderboard

---

## References

- DeGroot, M. H. (1974). Reaching a consensus. *Journal of the American Statistical Association*, 69(345), 118–121.
- Watts, D. J., & Strogatz, S. H. (1998). Collective dynamics of 'small-world' networks. *Nature*, 393, 440–442.
- Ester, M., Kriegel, H. P., Sander, J., & Xu, X. (1996). A density-based algorithm for discovering clusters in large spatial databases with noise. *KDD-96*, 226–231.

---

## Summary

This project models cultural evolution as an emergent process driven by local interactions within a dynamic network. It integrates computational modeling, real-time visualization, and systematic data collection to explore how genres form, compete, and collapse without centralized control — a direct implementation of self-organization principles from complex systems theory. Over 31 simulation runs, the project identified threshold effects, superadditive parameter interactions, and a three-phase convergence structure that mirrors real patterns in cultural evolution.
