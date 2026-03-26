import React, { useEffect, useRef, useState } from "react";
import GenreStats from "./components/GenreStats.jsx";
import ScatterPlot2D from "./components/ScatterPlot2D.jsx";

const API_BASE = "http://127.0.0.1:8000";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function safeArraySlice(arr, s, e) { return arr?.slice?.(s, e) ?? []; }
const MAX_STYLE_DIM = 8;

// ---------------------------------------------------------------------------
// Parameter validation
// Returns an array of error strings. Empty array = all good.
// ---------------------------------------------------------------------------

function validateParams({ numArtists, styleDim, avgDegree, p, sigma, alphaDecay, seed, stepMs }) {
    const errors = [];

    if (!Number.isInteger(numArtists) || numArtists < 5 || numArtists > 500)
        errors.push("Artists must be a whole number between 5 and 500.");

    if (!Number.isInteger(styleDim) || styleDim < 2 || styleDim > MAX_STYLE_DIM)
        errors.push(`Style Dimensions must be a whole number between 2 and ${MAX_STYLE_DIM}.`);

    if (!Number.isInteger(avgDegree) || avgDegree < 1 || avgDegree > 50)
        errors.push("Avg Degree must be a whole number between 1 and 50.");

    if (avgDegree >= numArtists)
        errors.push("Avg Degree must be less than the number of Artists.");

    if (isNaN(p) || p < 0 || p > 1)
        errors.push("Innovation Prob (p) must be between 0 and 1.");

    if (isNaN(sigma) || sigma < 0 || sigma > 1)
        errors.push("Innovation Noise (σ) must be between 0 and 1.");

    if (isNaN(alphaDecay) || alphaDecay < 0 || alphaDecay > 1)
        errors.push("Alpha Decay must be between 0 and 1.");

    if (!Number.isInteger(seed) || seed < 0)
        errors.push("Seed must be a positive whole number.");

    if (!Number.isInteger(stepMs) || stepMs < 50 || stepMs > 5000)
        errors.push("Step (ms) must be between 50 and 5000.");

    return errors;
}

// ---------------------------------------------------------------------------
// Responsive breakpoint hook
// ---------------------------------------------------------------------------

function useBreakpoint() {
    const [bp, setBp] = useState(() => {
        if (typeof window === "undefined") return "lg";
        const w = window.innerWidth;
        if (w < 640)  return "sm";
        if (w < 1024) return "md";
        return "lg";
    });
    useEffect(() => {
        const handler = () => {
            const w = window.innerWidth;
            setBp(w < 640 ? "sm" : w < 1024 ? "md" : "lg");
        };
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);
    return bp;
}

// ---------------------------------------------------------------------------
// Info content
// ---------------------------------------------------------------------------

const INFO = {
    simulation: {
        title: "How the simulation works",
        body: `Each artist is a point in an 8-dimensional "style space" where every dimension represents a musical attribute (e.g. energy, tempo, dissonance). At each tick, artists are pulled toward their neighbors' styles through a weighted influence equation:

X_i(t+1) = (1 - α_i) · X_i(t) + α_i · Σ w_ij · X_j(t) + noise

Where α_i is the artist's susceptibility, w_ij is the normalized influence weight from artist j to i, and noise is an occasional random creative jump. Artists that cluster together in style space are grouped into genres using DBSCAN.`,
    },
    scatter: {
        title: "2D Style Projection (PCA)",
        body: `Artists exist in 8-dimensional style space, which can't be displayed directly. Principal Component Analysis (PCA) finds the two directions of maximum variance and projects all artists onto them — so the plot shows the most "meaningful" 2D slice of the full space.

Each dot is an artist. Color = genre cluster. Dot size = betweenness centrality (how often that artist sits on the shortest network path between two others — a measure of cultural bridging). Trails show recent movement through style space.`,
    },
    genreStats: {
        title: "Genre & Influence Stats",
        body: `Genre Clusters: Artists are grouped using DBSCAN (Density-Based Spatial Clustering). DBSCAN finds dense regions in style space without requiring a fixed number of clusters. Artists in sparse regions are labelled "Experimental."

Influence Leaderboard: Ranks artists by betweenness centrality — a network measure of how many shortest paths between other artists pass through them. High betweenness = a "bridge" artist who connects different genre communities. Recalculated every 50 ticks.`,
    },
    artists: {
        title: "Number of Artists (N)",
        body: `Sets the total number of artist nodes in the network. More artists means more stable minority genres — with only 50 artists, one cluster can dominate quickly. With 150–200 artists, multiple genres can coexist longer.

Affects: network size, simulation speed, genre diversity.`,
    },
    styleDim: {
        title: "Style Dimensions (d)",
        body: `Each artist's musical style is a vector of d numbers between 0 and 1. Higher d means a larger style space — making it harder for artists to converge because there are more ways to be different.

d=2 collapses quickly. d=8 gives rich genre diversity. The PCA projection always shows the top 2 dimensions regardless of d.`,
    },
    avgDegree: {
        title: "Average Degree (k)",
        body: `Each artist is connected to approximately k other artists in a Watts-Strogatz small-world network. Higher k means more connections and faster style diffusion — genres merge more quickly. Lower k means artists are more isolated and genres persist longer.

Uses β=0.1 rewiring probability, creating "shortcuts" between distant artists that mimic viral cultural moments.`,
    },
    innovation: {
        title: "Innovation Probability (p)",
        body: `At each tick, every artist has a p probability of making a random creative jump regardless of their neighbors' influence. This models genuine artistic innovation.

Higher p keeps genres from fully converging. Too high and the simulation becomes noise with no stable genres.`,
    },
    sigma: {
        title: "Innovation Noise (σ)",
        body: `When an artist innovates (determined by p), the size of their creative jump is drawn from N(0, σ).

Small σ (0.02–0.05): artists drift slowly, genres are stable.
Large σ (0.1–0.3): artists make bold stylistic leaps, genres fragment and recombine.`,
    },
    alphaDecay: {
        title: "Alpha Decay",
        body: `Alpha (α_i) is each artist's susceptibility to peer influence. Alpha Decay reduces α for well-connected artists — meaning influential artists resist change more.

Higher Alpha Decay = established artists resist change. Lower = everyone is equally susceptible regardless of network position.`,
    },
    seed: {
        title: "Random Seed",
        body: `The seed initializes the random number generator, making runs fully reproducible. Same seed + same parameters = identical results every time.

The genre that "wins" is determined by which cluster starts closest to the center of style space, which varies with the seed.`,
    },
    stepMs: {
        title: "Step Speed (ms)",
        body: `How many milliseconds the UI waits between ticks when running continuously. Lower = faster, higher = easier to observe.

This is a display-only setting — it does not affect simulation math or results.`,
    },
};

// ---------------------------------------------------------------------------
// Info Modal
// ---------------------------------------------------------------------------

function InfoModal({ info, onClose }) {
    if (!info) return null;
    return (
        <div onClick={onClose} style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                background: "#161920",
                border: "1px solid rgba(255,255,255,0.13)",
                borderRadius: 16, padding: "22px 26px",
                maxWidth: 480, width: "100%",
                boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 15, color: "#e9eef7", fontWeight: 600 }}>
                        {info.title}
                    </h3>
                    <button onClick={onClose} style={{
                        background: "none", border: "none",
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 2px",
                    }}>×</button>
                </div>
                <p style={{
                    margin: 0, fontSize: 13, lineHeight: 1.8,
                    color: "rgba(255,255,255,0.72)", whiteSpace: "pre-wrap",
                }}>{info.body}</p>
            </div>
        </div>
    );
}

function InfoBtn({ infoKey, onClick }) {
    return (
        <button onClick={() => onClick(infoKey)} style={{
            width: 17, height: 17, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 10, fontWeight: 700, cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, padding: 0,
        }}>?</button>
    );
}

// ---------------------------------------------------------------------------
// Validation error banner
// ---------------------------------------------------------------------------

function ValidationErrors({ errors }) {
    if (!errors || errors.length === 0) return null;
    return (
        <div style={{
            padding: "11px 14px", borderRadius: 12, marginBottom: 14,
            background: "rgba(255,160,0,0.12)",
            border: "1px solid rgba(255,160,0,0.35)",
            fontSize: 13,
        }}>
            <b style={{ color: "rgba(255,180,0,0.95)" }}>
                Fix these before re-initializing:
            </b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7, color: "rgba(255,255,255,0.75)" }}>
                {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
        </div>
    );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
    const bp = useBreakpoint();

    const [status, setStatus] = useState("idle");
    const [error,  setError]  = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);

    const [numArtists, setNumArtists] = useState(50);
    const [styleDim,   setStyleDim]   = useState(3);
    const [avgDegree,  setAvgDegree]  = useState(4);
    const [p,          setP]          = useState(0.03);
    const [sigma,      setSigma]      = useState(0.04);
    const [alphaDecay, setAlphaDecay] = useState(0.3);
    const [seed,       setSeed]       = useState(42);

    const [tick,        setTick]        = useState(0);
    const [nodes,       setNodes]       = useState([]);
    const [links,       setLinks]       = useState([]);
    const [styles,      setStyles]      = useState([]);
    const [genres,      setGenres]      = useState([]);
    const [nodeHistory, setNodeHistory] = useState([]);

    const [running, setRunning] = useState(false);
    const [stepMs,  setStepMs]  = useState(400);
    const [activeInfo, setActiveInfo] = useState(null);

    const hasInitialized = useRef(false);

    const openInfo  = key => setActiveInfo(INFO[key]);
    const closeInfo = ()  => setActiveInfo(null);

    async function apiFetch(path, options) {
        const res = await fetch(API_BASE + path, options);
        if (!res.ok) {
            let text = "";
            try { text = await res.text(); } catch (e) { text = ""; }
            throw new Error("HTTP " + res.status + ": " + (text || res.statusText));
        }
        return res.json();
    }

    async function initSimulation() {
        // Validate before sending anything to the backend
        const errs = validateParams({ numArtists, styleDim, avgDegree, p, sigma, alphaDecay, seed, stepMs });
        if (errs.length > 0) {
            setValidationErrors(errs);
            return;
        }
        setValidationErrors([]);
        setStatus("initializing");
        setError(null);
        try {
            const data = await apiFetch("/api/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    N: numArtists, d: styleDim, k: avgDegree,
                    p, sigma, alpha_decay: alphaDecay, seed,
                }),
            });
            setTick(typeof data.tick === "number" ? data.tick : 0);
            setNodes(data.nodes || []); setLinks(data.links || []);
            setStyles(data.styles || []); setGenres(data.genres || []);
            setNodeHistory([]); setStatus("ready");
        } catch (e) { setError(e?.message ?? String(e)); setStatus("error"); }
    }

    async function stepSimulation() {
        setStatus("stepping"); setError(null);
        try {
            const data = await apiFetch("/api/step", { method: "POST" });
            if (typeof data.tick === "number") setTick(data.tick); else setTick(t => t + 1);
            if (data.nodes)  setNodes(data.nodes);
            if (data.links)  setLinks(data.links);
            if (data.styles) setStyles(data.styles);
            if (data.genres) setGenres(data.genres);
            if (data.nodes) {
                setNodeHistory(h => {
                    const trimmed = (h || []).slice(Math.max(0, h.length - 30));
                    return [...trimmed, data.nodes];
                });
            }
            setStatus("ready");
        } catch (e) { setError(e?.message ?? String(e)); setStatus("error"); setRunning(false); }
    }

    useEffect(() => {
        if (!running) return;
        const h = setInterval(() => stepSimulation(), clamp(stepMs, 50, 5000));
        return () => clearInterval(h); // eslint-disable-next-line
    }, [running, stepMs]);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;
        initSimulation(); // eslint-disable-next-line
    }, []);

    // Clear validation errors as the user fixes inputs
    const makeIntSetter   = (setter, key) => v => { setter(parseInt(v));   setValidationErrors([]); };
    const makeFloatSetter = (setter, key) => v => { setter(parseFloat(v)); setValidationErrors([]); };

    const controls = [
        { label: "Artists",              infoKey: "artists",    value: numArtists, set: makeIntSetter(setNumArtists),   min: 5,  max: 500,          step: 1    },
        { label: "Style Dimensions",     infoKey: "styleDim",   value: styleDim,   set: makeIntSetter(setStyleDim),     min: 2,  max: MAX_STYLE_DIM, step: 1    },
        { label: "Avg Degree",           infoKey: "avgDegree",  value: avgDegree,  set: makeIntSetter(setAvgDegree),    min: 1,  max: 50,            step: 1    },
        { label: "Innovation Prob (p)",  infoKey: "innovation", value: p,          set: makeFloatSetter(setP),          min: 0,  max: 1,             step: 0.01 },
        { label: "Innovation Noise (σ)", infoKey: "sigma",      value: sigma,      set: makeFloatSetter(setSigma),      min: 0,  max: 1,             step: 0.01 },
        { label: "Alpha Decay",          infoKey: "alphaDecay", value: alphaDecay, set: makeFloatSetter(setAlphaDecay), min: 0,  max: 1,             step: 0.05 },
        { label: "Seed",                 infoKey: "seed",       value: seed,       set: makeIntSetter(setSeed),         min: 0,  max: 999999,        step: 1    },
        { label: "Step (ms)",            infoKey: "stepMs",     value: stepMs,     set: makeIntSetter(setStepMs),       min: 50, max: 5000,          step: 50   },
    ];

    // Which controls have failing validation — highlight them red
    const validationMessages = validateParams({ numArtists, styleDim, avgDegree, p, sigma, alphaDecay, seed, stepMs });
    const invalidLabels = new Set();
    if (validationMessages.some(e => e.includes("Artists")))           invalidLabels.add("Artists");
    if (validationMessages.some(e => e.includes("Style Dimensions")))  invalidLabels.add("Style Dimensions");
    if (validationMessages.some(e => e.includes("Avg Degree")))        invalidLabels.add("Avg Degree");
    if (validationMessages.some(e => e.includes("Avg Degree must be less"))) invalidLabels.add("Avg Degree");
    if (validationMessages.some(e => e.includes("Prob")))              invalidLabels.add("Innovation Prob (p)");
    if (validationMessages.some(e => e.includes("Noise")))             invalidLabels.add("Innovation Noise (σ)");
    if (validationMessages.some(e => e.includes("Alpha Decay")))       invalidLabels.add("Alpha Decay");
    if (validationMessages.some(e => e.includes("Seed")))              invalidLabels.add("Seed");
    if (validationMessages.some(e => e.includes("Step")))              invalidLabels.add("Step (ms)");

    const gridStyle = {
        display: "grid", gap: 14, width: "100%",
        gridTemplateColumns:
            bp === "sm"  ? "1fr" :
            bp === "md"  ? "1fr 1fr" :
                           "minmax(0,1fr) minmax(0,1.4fr) minmax(0,1fr)",
        alignItems: "start",
    };

    return (
        <div style={{
            minHeight: "100vh", background: "#0b0d12", color: "#e9eef7",
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            padding: bp === "sm" ? 10 : 16, boxSizing: "border-box",
        }}>
            <InfoModal info={activeInfo} onClose={closeInfo} />

            <header style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: 10, padding: "11px 14px", borderRadius: 14,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)", marginBottom: 14,
            }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: bp === "sm" ? 16 : 20, letterSpacing: 0.2 }}>
                        🎵 Genre Evolution Simulator
                    </h1>
                    <div style={{ marginTop: 3, opacity: 0.72, fontSize: 12 }}>
                        Tick: <b>{tick}</b> · Status: <b>{status}</b>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <InfoBtn infoKey="simulation" onClick={openInfo} />
                    <button style={btn} onClick={initSimulation}>Re-Init</button>
                    <button style={btn} onClick={stepSimulation} disabled={running}>Step</button>
                    <button
                        style={{ ...btn, background: running ? "rgba(240,80,80,0.2)" : "rgba(40,200,120,0.2)" }}
                        onClick={() => setRunning(r => !r)}
                    >{running ? "Stop" : "Run"}</button>
                </div>
            </header>

            {/* Validation errors */}
            <ValidationErrors errors={validationErrors} />

            {/* API errors */}
            {error && (
                <div style={{
                    padding: "11px 14px", borderRadius: 12, marginBottom: 14,
                    background: "rgba(240,80,80,0.14)",
                    border: "1px solid rgba(240,80,80,0.35)", fontSize: 13,
                }}>
                    <b>Error:</b> {error}
                    <div style={{ marginTop: 5, opacity: 0.85 }}>
                        Make sure FastAPI is running on <code>127.0.0.1:8000</code>.
                    </div>
                </div>
            )}

            <div style={gridStyle}>
                {/* Panel 1 — Genre Stats */}
                <section style={card}>
                    <div style={cardHeader}>
                        <h2 style={cardTitle}>Genre & Influence Stats</h2>
                        <InfoBtn infoKey="genreStats" onClick={openInfo} />
                    </div>
                    <GenreStats nodes={nodes} genres={genres} />
                </section>

                {/* Panel 2 — Scatter */}
                <section style={card}>
                    <div style={cardHeader}>
                        <h2 style={cardTitle}>2D Style Projection (PCA)</h2>
                        <InfoBtn infoKey="scatter" onClick={openInfo} />
                    </div>
                    <div style={{ minHeight: 380 }}>
                        <ScatterPlot2D nodes={nodes} genres={genres} history={nodeHistory} />
                    </div>
                </section>

                {/* Panel 3 — Controls + Preview */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <section style={card}>
                        <div style={cardHeader}>
                            <h2 style={cardTitle}>Controls</h2>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            {controls.map(ctrl => {
                                const invalid = invalidLabels.has(ctrl.label);
                                return (
                                    <div key={ctrl.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                            <span style={{ fontSize: 11, opacity: invalid ? 1 : 0.78, flex: 1, color: invalid ? "rgba(255,160,0,0.95)" : "inherit" }}>
                                                {ctrl.label}
                                            </span>
                                            <InfoBtn infoKey={ctrl.infoKey} onClick={openInfo} />
                                        </div>
                                        <input
                                            style={{
                                                ...inputStyle,
                                                borderColor: invalid
                                                    ? "rgba(255,160,0,0.6)"
                                                    : "rgba(255,255,255,0.11)",
                                            }}
                                            type="number"
                                            value={ctrl.value}
                                            min={ctrl.min} max={ctrl.max} step={ctrl.step}
                                            onChange={e => ctrl.set(e.target.value)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.5 }}>
                            Click <b>Re-Init</b> to apply changes.
                        </div>
                    </section>

                    <section style={card}>
                        <div style={cardHeader}>
                            <h2 style={cardTitle}>Data Preview</h2>
                        </div>
                        <div style={{ maxHeight: 300, overflow: "auto" }}>
                            <pre style={{
                                margin: 0, padding: 10, borderRadius: 9,
                                background: "rgba(0,0,0,0.35)",
                                border: "1px solid rgba(255,255,255,0.07)",
                                fontSize: 11, lineHeight: 1.45,
                                color: "rgba(255,255,255,0.65)",
                            }}>
                                {JSON.stringify({
                                    tick,
                                    nodes:  safeArraySlice(nodes,  0, 5),
                                    links:  safeArraySlice(links,  0, 5),
                                    styles: safeArraySlice(styles, 0, 3),
                                    genres: safeArraySlice(genres, 0, 10),
                                }, null, 2)}
                            </pre>
                        </div>
                    </section>
                </div>
            </div>

            <footer style={{ marginTop: 14, opacity: 0.4, fontSize: 11, textAlign: "center" }}>
                Frontend: localhost · Backend: {API_BASE}
            </footer>
        </div>
    );
}

const btn = {
    padding: "8px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#e9eef7", cursor: "pointer", fontSize: 13,
};
const card = {
    padding: 16, borderRadius: 14,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
};
const cardHeader = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 };
const cardTitle  = { margin: 0, fontSize: 14, fontWeight: 600, opacity: 0.95, flex: 1 };
const inputStyle = {
    padding: "7px 9px", borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.11)",
    background: "rgba(0,0,0,0.3)",
    color: "#e9eef7", outline: "none",
    fontSize: 12, width: "100%", boxSizing: "border-box",
};