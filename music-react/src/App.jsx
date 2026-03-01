import React, { useEffect, useMemo, useState } from "react";
import Graph3D from "./components/Graph3D.jsx";
import ScatterPlot2D from "./components/ScatterPlot2D.jsx";

/**
 * Music Genre Evolution Simulator - UI
 * - Fetches simulation state from backend
 * - Displays 3D network + 2D scatter projections
 * - Provides controls for parameters + playback
 */

// Adjust this if your backend runs on a different port/host.
// If you set a proxy in package.json, you can change to "" and use relative paths.
const API_BASE = "http://127.0.0.1:8000";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function safeVecValue(vec, idx, fallback) {
    if (!vec || typeof idx !== "number") return fallback;
    const val = vec[idx];
    return typeof val === "number" ? val : fallback;
}

function safeArraySlice(arr, start, end) {
    if (!arr || !arr.slice) return [];
    return arr.slice(start, end);
}

export default function App() {
    const [status, setStatus] = useState("idle");
    const [error, setError] = useState(null);

    // Simulation parameters
    const [numArtists, setNumArtists] = useState(50);
    const [styleDim, setStyleDim] = useState(3);
    const [avgDegree, setAvgDegree] = useState(4);
    const [alpha, setAlpha] = useState(0.25); // influence rate
    const [noise, setNoise] = useState(0.02); // random drift
    const [seed, setSeed] = useState(42);

    // Simulation state
    const [tick, setTick] = useState(0);
    const [nodes, setNodes] = useState([]);
    const [links, setLinks] = useState([]);
    const [styles, setStyles] = useState([]); // array of vectors per node
    const [genres, setGenres] = useState([]); // optional cluster id per node
    const [history2d, setHistory2d] = useState([]); // for scatter trails

    // Playback
    const [running, setRunning] = useState(false);
    const [stepMs, setStepMs] = useState(400);

    // Projection dims for 2D plot
    const [xDim, setXDim] = useState(0);
    const [yDim, setYDim] = useState(1);

    // Derived 2D points for scatter plot
    const points2d = useMemo(() => {
        if (!styles || styles.length === 0) return [];
        return styles.map((vec, i) => {
            return {
                id: i,
                x: safeVecValue(vec, xDim, 0),
                y: safeVecValue(vec, yDim, 0),
                genre: genres && typeof genres[i] !== "undefined" ? genres[i] : null,
            };
        });
    }, [styles, xDim, yDim, genres]);

    async function apiFetch(path, options) {
        const res = await fetch(API_BASE + path, options);
        if (!res.ok) {
            let text = "";
            try {
                text = await res.text();
            } catch (e) {
                text = "";
            }
            throw new Error("HTTP " + res.status + ": " + (text || res.statusText));
        }
        return res.json();
    }

    async function initSimulation() {
        setStatus("initializing");
        setError(null);
        try {
            const payload = {
                num_artists: numArtists,
                style_dim: styleDim,
                avg_degree: avgDegree,
                alpha: alpha,
                noise: noise,
                seed: seed,
            };

            const data = await apiFetch("/api/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            // Expected shape:
            // { tick, nodes:[{id}], links:[{source,target}], styles:[[...]], genres:[...] }
            setTick(typeof data.tick === "number" ? data.tick : 0);
            setNodes(data.nodes ? data.nodes : []);
            setLinks(data.links ? data.links : []);
            setStyles(data.styles ? data.styles : []);
            setGenres(data.genres ? data.genres : []);
            setHistory2d([]);
            setStatus("ready");
        } catch (e) {
            setError(e && e.message ? e.message : String(e));
            setStatus("error");
        }
    }

    async function stepSimulation() {
        setStatus("stepping");
        setError(null);
        try {
            const data = await apiFetch("/api/step", { method: "POST" });

            // FIXED: avoid `data.tick ?? (t) => t + 1` parse/logic issues
            if (typeof data.tick === "number") {
                setTick(data.tick);
            } else {
                setTick(function (t) {
                    return t + 1;
                });
            }

            if (data.nodes) setNodes(data.nodes);
            if (data.links) setLinks(data.links);
            if (data.styles) setStyles(data.styles);
            if (data.genres) setGenres(data.genres);

            // Add to history for trail visualization
            if (data.styles) {
                const pts = data.styles.map((vec, i) => {
                    const gFromData =
                        data.genres && typeof data.genres[i] !== "undefined" ? data.genres[i] : undefined;
                    const gFromState = genres && typeof genres[i] !== "undefined" ? genres[i] : undefined;

                    return {
                        id: i,
                        x: safeVecValue(vec, xDim, 0),
                        y: safeVecValue(vec, yDim, 0),
                        genre: typeof gFromData !== "undefined" ? gFromData : (typeof gFromState !== "undefined" ? gFromState : null),
                    };
                });

                setHistory2d(function (h) {
                    const prev = h || [];
                    const trimmed = prev.slice(Math.max(0, prev.length - 50));
                    return trimmed.concat([pts]);
                });
            }

            setStatus("ready");
        } catch (e) {
            setError(e && e.message ? e.message : String(e));
            setStatus("error");
            setRunning(false);
        }
    }

    // Playback loop
    useEffect(() => {
        if (!running) return;

        const handle = setInterval(() => {
            stepSimulation();
        }, clamp(stepMs, 50, 5000));

        return () => clearInterval(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, stepMs, xDim, yDim]);

    // Initialize once on load
    useEffect(() => {
        initSimulation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div style={stylesUI.page}>
            <header style={stylesUI.header}>
                <div>
                    <h1 style={stylesUI.title}>🎵 Genre Evolution Simulator</h1>
                    <div style={stylesUI.sub}>
                        Tick: <b>{tick}</b> • Status: <b>{status}</b>
                    </div>
                </div>

                <div style={stylesUI.headerRight}>
                    <button style={stylesUI.btn} onClick={initSimulation}>
                        Re-Init
                    </button>
                    <button style={stylesUI.btn} onClick={stepSimulation} disabled={running}>
                        Step
                    </button>
                    <button
                        style={{
                            ...stylesUI.btn,
                            ...(running ? stylesUI.btnDanger : stylesUI.btnGood),
                        }}
                        onClick={() =>
                            setRunning(function (r) {
                                return !r;
                            })
                        }
                    >
                        {running ? "Stop" : "Run"}
                    </button>
                </div>
            </header>

            {error ? (
                <div style={stylesUI.errorBox}>
                    <b>Error:</b> {error}
                    <div style={{ marginTop: 8, opacity: 0.9 }}>
                        If your frontend is on <code>localhost:3000</code> and backend is on{" "}
                        <code>127.0.0.1:8000</code>, make sure FastAPI has CORS enabled.
                    </div>
                </div>
            ) : null}

            <div style={stylesUI.grid}>
                <section style={stylesUI.card}>
                    <h2 style={stylesUI.cardTitle}>3D Influence Network</h2>
                    <div style={{ height: 520 }}>
                        <Graph3D nodes={nodes} links={links} styles={styles} genres={genres} />
                    </div>
                </section>

                <section style={stylesUI.card}>
                    <h2 style={stylesUI.cardTitle}>2D Style Projection</h2>
                    <div style={stylesUI.row}>
                        <label style={stylesUI.label}>
                            X dim
                            <select
                                style={stylesUI.select}
                                value={xDim}
                                onChange={(e) => setXDim(parseInt(e.target.value, 10))}
                            >
                                {Array.from({ length: styleDim }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={stylesUI.label}>
                            Y dim
                            <select
                                style={stylesUI.select}
                                value={yDim}
                                onChange={(e) => setYDim(parseInt(e.target.value, 10))}
                            >
                                {Array.from({ length: styleDim }, (_, i) => (
                                    <option key={i} value={i}>
                                        {i}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={stylesUI.label}>
                            Step (ms)
                            <input
                                style={stylesUI.input}
                                type="number"
                                value={stepMs}
                                min={50}
                                max={5000}
                                onChange={(e) => setStepMs(parseInt(e.target.value, 10))}
                            />
                        </label>
                    </div>

                    <div style={{ height: 520 }}>
                        <ScatterPlot2D points={points2d} history={history2d} />
                    </div>
                </section>

                <section style={stylesUI.card}>
                    <h2 style={stylesUI.cardTitle}>Controls</h2>

                    <div style={stylesUI.controls}>
                        <label style={stylesUI.label}>
                            Artists
                            <input
                                style={stylesUI.input}
                                type="number"
                                value={numArtists}
                                min={5}
                                max={500}
                                onChange={(e) => setNumArtists(parseInt(e.target.value, 10))}
                            />
                        </label>

                        <label style={stylesUI.label}>
                            Style Dimensions
                            <input
                                style={stylesUI.input}
                                type="number"
                                value={styleDim}
                                min={2}
                                max={10}
                                onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    setStyleDim(v);
                                    setXDim((d) => clamp(d, 0, v - 1));
                                    setYDim((d) => clamp(d, 0, v - 1));
                                }}
                            />
                        </label>

                        <label style={stylesUI.label}>
                            Avg Degree
                            <input
                                style={stylesUI.input}
                                type="number"
                                value={avgDegree}
                                min={1}
                                max={50}
                                onChange={(e) => setAvgDegree(parseInt(e.target.value, 10))}
                            />
                        </label>

                        <label style={stylesUI.label}>
                            Alpha (Influence)
                            <input
                                style={stylesUI.input}
                                type="number"
                                step="0.01"
                                value={alpha}
                                min={0}
                                max={1}
                                onChange={(e) => setAlpha(parseFloat(e.target.value))}
                            />
                        </label>

                        <label style={stylesUI.label}>
                            Noise
                            <input
                                style={stylesUI.input}
                                type="number"
                                step="0.01"
                                value={noise}
                                min={0}
                                max={1}
                                onChange={(e) => setNoise(parseFloat(e.target.value))}
                            />
                        </label>

                        <label style={stylesUI.label}>
                            Seed
                            <input
                                style={stylesUI.input}
                                type="number"
                                value={seed}
                                onChange={(e) => setSeed(parseInt(e.target.value, 10))}
                            />
                        </label>
                    </div>

                    <div style={stylesUI.note}>
                        Tip: Click <b>Re-Init</b> after changing controls to apply.
                    </div>
                </section>

                <section style={stylesUI.card}>
                    <h2 style={stylesUI.cardTitle}>Data Preview</h2>
                    <div style={stylesUI.preview}>
                        <pre style={stylesUI.pre}>
                            {JSON.stringify(
                                {
                                    tick: tick,
                                    nodes: safeArraySlice(nodes, 0, 5),
                                    links: safeArraySlice(links, 0, 5),
                                    styles: safeArraySlice(styles, 0, 3),
                                    genres: safeArraySlice(genres, 0, 10),
                                },
                                null,
                                2
                            )}
                        </pre>
                    </div>
                </section>
            </div>

            <footer style={stylesUI.footer}>
                <span>Frontend: localhost • Backend: {API_BASE}</span>
            </footer>
        </div>
    );
}

const stylesUI = {
    page: {
        minHeight: "100vh",
        background: "#0b0d12",
        color: "#e9eef7",
        fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, "Apple Color Emoji","Segoe UI Emoji"',
        padding: 18,
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        marginBottom: 14,
    },
    title: { margin: 0, fontSize: 22, letterSpacing: 0.2 },
    sub: { marginTop: 4, opacity: 0.8, fontSize: 13 },
    headerRight: { display: "flex", gap: 10, flexWrap: "wrap" },
    btn: {
        padding: "9px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.08)",
        color: "#e9eef7",
        cursor: "pointer",
    },
    btnGood: { background: "rgba(40, 200, 120, 0.18)" },
    btnDanger: { background: "rgba(240, 80, 80, 0.18)" },
    errorBox: {
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(240, 80, 80, 0.14)",
        border: "1px solid rgba(240, 80, 80, 0.35)",
        marginBottom: 14,
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
        gap: 14,
    },
    card: {
        padding: 14,
        borderRadius: 16,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
    },
    cardTitle: { marginTop: 0, marginBottom: 10, fontSize: 16, opacity: 0.95 },
    row: { display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 10 },
    controls: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    label: { display: "grid", gap: 6, fontSize: 12, opacity: 0.9 },
    input: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.28)",
        color: "#e9eef7",
        outline: "none",
    },
    select: {
        padding: "8px 10px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.28)",
        color: "#e9eef7",
        outline: "none",
    },
    note: { marginTop: 10, opacity: 0.75, fontSize: 13 },
    preview: { maxHeight: 520, overflow: "auto" },
    pre: {
        margin: 0,
        padding: 12,
        borderRadius: 14,
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.10)",
        fontSize: 12,
        lineHeight: 1.35,
    },
    footer: { marginTop: 14, opacity: 0.7, fontSize: 12, textAlign: "center" },
};