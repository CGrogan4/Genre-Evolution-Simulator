# Music Genre Evolution Simulation

**CS 4632 – Modeling and Simulation (Milestone 2)**

A real-time simulation of music genre evolution using network dynamics and influence-based style updates. Artists are modeled as nodes in an influence network, and genre clusters emerge over time through local interactions.

---

## Project Status

### Implemented

- FastAPI backend with WebSocket communication
- Simulation engine with:
  - Artist style vectors
  - Influence network
  - Iterative update mechanism
- React + Vite frontend
- 3D force-directed network visualization
- 2D style projection plot
- Real-time Play / Pause / Step controls
- Adjustable simulation parameters

### Still To Come

- Formal clustering algorithm (e.g., K-means)
- Data export (CSV / JSON)
- Additional network models
- Performance improvements for large simulations
- Style changes to improve user interface

### Changes from Proposal

- Switched from REST to WebSocket architecture for real-time updates
- Added interactive 3D visualization layer
- Separated frontend and backend services

---

## Installation

### Backend (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Backend runs at: `http://127.0.0.1:8000`

WebSocket endpoint: `ws://127.0.0.1:8000/ws`

### Frontend (React + Vite)

```bash
cd music-react
npm install
npm run dev
```

Frontend runs at: `http://localhost:5173`

---

## Usage

1. Start the backend
2. Start the frontend
3. Open your browser at `http://localhost:5173`
4. Use the controls:

| Control | Description |
|--------|-------------|
| **Step** | Advance one timestep |
| **Run** | Start continuous simulation |
| **Stop** | Pause simulation |
| **Re-Init** | Reset with new parameters |

### Adjustable Parameters

| Parameter | Description |
|-----------|-------------|
| Number of Artists | Size of the simulation population |
| Style Dimensions | Dimensionality of the style vector space |
| Influence Rate (alpha) | How strongly artists pull toward neighbors |
| Noise | Random drift / innovation probability |
| Network Connectivity | Average degree of the influence network |
| Random Seed | Reproducibility control |

---

## Architecture Overview

### Backend

- **`SimulationEngine`** – updates artist styles and network state
- **`/ws` WebSocket endpoint** – broadcasts simulation frames in real time
- **Parameter update handling** – live parameter injection mid-simulation

### Frontend

| File | Role |
|------|------|
| `App.jsx` | State management + WebSocket control |
| `Graph3D.jsx` | 3D force-directed influence network |
| `ScatterPlot2D.jsx` | 2D style-space projection with genre trails |

### Design Principles

- Simulation logic fully separated from visualization
- Event-driven communication via WebSockets
- Clear mapping to UML components: Engine, Network, Visualization Layer

---

## Expected Behavior

- **Nodes** represent individual artists
- **Edges** represent influence relationships between artists
- **Styles** evolve each timestep based on neighbor influence and random noise
- **Clusters** visually emerge as genre groupings in both the 3D network and 2D scatter plot
- **Parameter tuning** produces qualitatively different outcomes:

| Parameter Regime | Observed Behavior |
|-----------------|-------------------|
| High alpha, low noise | Rapid convergence to one genre |
| Low alpha, high noise | Fragmentation, no stable clusters |
| Balanced alpha + noise | Stable subgenres emerge and persist |

---

## 📌 Summary

This project models cultural evolution as an emergent process driven by local interactions within a dynamic network. It integrates computational modeling, real-time communication, and interactive visualization to explore how genres form and evolve without centralized control — a direct implementation of self-organization principles from complex systems theory.
