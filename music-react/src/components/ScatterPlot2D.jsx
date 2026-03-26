import React, { useMemo } from "react";

/**
 * ScatterPlot2D — uses PCA-projected node positions (x/y from export_frame)
 * instead of raw style vector dimensions. This gives meaningful cluster
 * separation rather than an arbitrary 2D slice of 8D space.
 *
 * Props:
 *   nodes    — array of node objects from the frame: { id, x, y, group, influence }
 *   genres   — array of genre labels per artist (parallel to nodes)
 *   history  — array of past node arrays for trails
 */

const GENRE_NAMES = [
        "Pop", "Heavy Metal", "Blues", "Ambient",
        "Folk", "Electronic", "K-pop", "Experimental",
        "Jazz", "Classical", "Rock", "Traditional World",
];

function genreColor(id, alpha = 1) {
    // Evenly spaced hues, distinct saturations to avoid clumping
    const hue = ((id * 97) % 360 + 360) % 360;
    return `hsla(${hue}, 78%, 62%, ${alpha})`;
}

function genreName(id, totalGenres) {
    // Last genre = Experimental (noise points)
    if (id === totalGenres - 1 && totalGenres > 1) return "Experimental";
    return GENRE_NAMES[id % (GENRE_NAMES.length - 1)];
}

function isFiniteNum(v) {
    return typeof v === "number" && isFinite(v);
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export default function ScatterPlot2D({ nodes = [], genres = [], history = [] }) {
    const WIDTH  = 820;
    const HEIGHT = 480;
    const PAD    = 40;

    // Compute bounds from current node positions (PCA x/y)
    const { bounds, normalized } = useMemo(() => {
        const valid = nodes.filter(n => isFiniteNum(n.x) && isFiniteNum(n.y));
        if (valid.length === 0) {
            return { bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 }, normalized: [] };
        }

        let minX = valid[0].x, maxX = valid[0].x;
        let minY = valid[0].y, maxY = valid[0].y;
        for (const n of valid) {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }

        // Add 10% padding around the data
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;
        minX -= spanX * 0.1; maxX += spanX * 0.1;
        minY -= spanY * 0.1; maxY += spanY * 0.1;

        const dX = maxX - minX || 1;
        const dY = maxY - minY || 1;

        const normalized = valid.map(n => ({
            ...n,
            nx: (n.x - minX) / dX,
            ny: (n.y - minY) / dY,
            genre: genres[n.id] ?? n.group ?? 0,
        }));

        return { bounds: { minX, maxX, minY, maxY }, normalized };
    }, [nodes, genres]);

    // Convert normalised [0,1] coords to SVG screen coords
    const toScreen = (nx, ny) => ({
        sx: PAD + nx * (WIDTH  - PAD * 2),
        sy: PAD + (1 - ny) * (HEIGHT - PAD * 2),
    });

    // Build genre summary for the legend
    const genreSummary = useMemo(() => {
        if (!normalized.length) return [];
        const counts = {};
        for (const n of normalized) {
            counts[n.genre] = (counts[n.genre] || 0) + 1;
        }
        const totalGenres = Object.keys(counts).length;
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([id, count]) => ({
                id: Number(id),
                count,
                name: genreName(Number(id), totalGenres),
                color: genreColor(Number(id)),
            }));
    }, [normalized]);

    // Build centroid positions for cluster labels
    const centroids = useMemo(() => {
        const sums = {};
        for (const n of normalized) {
            if (!sums[n.genre]) sums[n.genre] = { sx: 0, sy: 0, count: 0 };
            const { sx, sy } = toScreen(clamp(n.nx, 0, 1), clamp(n.ny, 0, 1));
            sums[n.genre].sx    += sx;
            sums[n.genre].sy    += sy;
            sums[n.genre].count += 1;
        }
        const totalGenres = Object.keys(sums).length;
        return Object.entries(sums).map(([id, v]) => ({
            id:    Number(id),
            sx:    v.sx / v.count,
            sy:    v.sy / v.count,
            name:  genreName(Number(id), totalGenres),
            color: genreColor(Number(id)),
        }));
    }, [normalized]);

    // Trails — use last 8 history frames, keyed by node id
    const trails = useMemo(() => {
        const frames = history.slice(-8);
        if (frames.length < 2) return [];

        // Build per-id position history using node x/y (PCA coords)
        const byId = {};
        for (let f = 0; f < frames.length; f++) {
            const frame = frames[f] || [];
            for (const n of frame) {
                if (!isFiniteNum(n.x) || !isFiniteNum(n.y)) continue;
                if (!byId[n.id]) byId[n.id] = [];
                byId[n.id].push({ x: n.x, y: n.y, genre: genres[n.id] ?? n.group ?? 0, f });
            }
        }

        const { minX, maxX, minY, maxY } = bounds;
        const dX = maxX - minX || 1;
        const dY = maxY - minY || 1;

        const paths = [];
        for (const id in byId) {
            const pts = byId[id];
            if (pts.length < 2) continue;
            const segments = [];
            for (let k = 1; k < pts.length; k++) {
                const a = pts[k - 1], b = pts[k];
                const nxa = (a.x - minX) / dX, nya = (a.y - minY) / dY;
                const nxb = (b.x - minX) / dX, nyb = (b.y - minY) / dY;
                const sa = toScreen(clamp(nxa, 0, 1), clamp(nya, 0, 1));
                const sb = toScreen(clamp(nxb, 0, 1), clamp(nyb, 0, 1));
                const opacity = (k / pts.length) * 0.22;
                segments.push({ sa, sb, opacity, genre: b.genre });
            }
            paths.push({ id, segments });
        }
        return paths;
    }, [history, bounds, genres]);

    const fmtAxis = v => isFiniteNum(v) ? v.toFixed(1) : "0.0";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>

            {/* Legend */}
            {genreSummary.length > 0 && (
                <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px 14px",
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                }}>
                    {genreSummary.map(g => (
                        <div key={g.id} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 11,
                            color: "rgba(255,255,255,0.8)",
                        }}>
                            <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: g.color,
                                flexShrink: 0,
                                boxShadow: `0 0 5px ${g.color}`,
                            }} />
                            <span>{g.name}</span>
                            <span style={{ opacity: 0.45 }}>({g.count})</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Plot */}
            <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                style={{ borderRadius: 12, background: "rgba(0,0,0,0.28)", flex: 1 }}
            >
                {/* Subtle grid */}
                {[0.25, 0.5, 0.75].map(t => {
                    const gx = PAD + t * (WIDTH  - PAD * 2);
                    const gy = PAD + t * (HEIGHT - PAD * 2);
                    return (
                        <g key={t}>
                            <line x1={gx} y1={PAD} x2={gx} y2={HEIGHT - PAD}
                                stroke="rgba(255,255,255,0.04)" strokeDasharray="3 5" />
                            <line x1={PAD} y1={gy} x2={WIDTH - PAD} y2={gy}
                                stroke="rgba(255,255,255,0.04)" strokeDasharray="3 5" />
                        </g>
                    );
                })}

                {/* Axes */}
                <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD}
                    stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD}
                    stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

                {/* Axis labels — PCA dimensions, not raw dims */}
                <text x={PAD + 4} y={16}
                    fill="rgba(255,255,255,0.35)" fontSize="11" fontFamily="monospace">
                    PCA 1 · {fmtAxis(bounds.minY)} → {fmtAxis(bounds.maxY)}
                </text>
                <text x={WIDTH - PAD} y={HEIGHT - 8}
                    fill="rgba(255,255,255,0.35)" fontSize="11" fontFamily="monospace"
                    textAnchor="end">
                    PCA 2 · {fmtAxis(bounds.minX)} → {fmtAxis(bounds.maxX)}
                </text>

                {/* Trails */}
                {trails.map(t =>
                    t.segments.map((seg, si) => (
                        <line
                            key={`trail-${t.id}-${si}`}
                            x1={seg.sa.sx} y1={seg.sa.sy}
                            x2={seg.sb.sx} y2={seg.sb.sy}
                            stroke={genreColor(seg.genre, seg.opacity)}
                            strokeWidth="1"
                        />
                    ))
                )}

                {/* Cluster centroid labels */}
                {centroids.map(c => (
                    <text
                        key={`label-${c.id}`}
                        x={c.sx}
                        y={c.sy - 14}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="monospace"
                        fill={c.color}
                        opacity="0.7"
                    >
                        {c.name}
                    </text>
                ))}

                {/* Points */}
                {normalized.map(n => {
                    const { sx, sy } = toScreen(clamp(n.nx, 0, 1), clamp(n.ny, 0, 1));
                    const color = genreColor(n.genre);
                    // Size by influence so bridge artists are visually prominent
                    const r = 4.5 + (n.influence || 0) * 4;
                    return (
                        <g key={n.id}>
                            <circle cx={sx} cy={sy} r={r + 5}
                                fill={genreColor(n.genre, 0.06)} />
                            <circle cx={sx} cy={sy} r={r}
                                fill={color} />
                            <circle cx={sx} cy={sy} r={r}
                                fill="none"
                                stroke={genreColor(n.genre, 0.45)}
                                strokeWidth="0.8" />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}