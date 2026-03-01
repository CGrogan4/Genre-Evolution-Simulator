import React, { useMemo } from "react";

/**
 * Simple 2D scatter plot without external chart libs.
 * - points: [{id, x, y, genre}]
 * - history: array of points arrays (for trails), optional
 */

function hashHue(n) {
    // deterministic hue 0..360
    return ((n * 97) % 360 + 360) % 360;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function isFiniteNumber(v) {
    return typeof v === "number" && isFinite(v);
}

export default function ScatterPlot2D(props) {
    const pointsRaw = props.points || [];
    const historyRaw = props.history || [];

    // Clean points so we don't crash on undefined/null/strings
    const points = useMemo(() => {
        const out = [];
        for (let i = 0; i < pointsRaw.length; i++) {
            const p = pointsRaw[i];
            if (!p) continue;

            const x = Number(p.x);
            const y = Number(p.y);

            if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;

            out.push({
                id: typeof p.id !== "undefined" ? p.id : i,
                x: x,
                y: y,
                genre: typeof p.genre !== "undefined" ? p.genre : null,
            });
        }
        return out;
    }, [pointsRaw]);

    const memo = useMemo(() => {
        if (!points || points.length === 0) {
            return {
                bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
                normalized: [],
            };
        }

        let minX = points[0].x;
        let maxX = points[0].x;
        let minY = points[0].y;
        let maxY = points[0].y;

        for (let i = 1; i < points.length; i++) {
            const px = points[i].x;
            const py = points[i].y;

            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }

        // add padding so points aren't on edges
        const spanX = maxX - minX || 1;
        const spanY = maxY - minY || 1;
        const padX = spanX * 0.08;
        const padY = spanY * 0.08;

        minX -= padX;
        maxX += padX;
        minY -= padY;
        maxY += padY;

        const denomX = maxX - minX || 1;
        const denomY = maxY - minY || 1;

        const normalized = points.map((p) => ({
            id: p.id,
            x: p.x,
            y: p.y,
            genre: p.genre,
            nx: (p.x - minX) / denomX,
            ny: (p.y - minY) / denomY,
        }));

        return { bounds: { minX, maxX, minY, maxY }, normalized: normalized };
    }, [points]);

    const bounds = memo.bounds;
    const normalized = memo.normalized;

    const width = 820;
    const height = 520;
    const pad = 22;

    const toScreen = (nx, ny) => {
        const x = pad + nx * (width - pad * 2);
        const y = pad + (1 - ny) * (height - pad * 2);
        return { x: x, y: y };
    };

    // Trails: use a plain object instead of Map for compatibility
    const trails = useMemo(() => {
        if (!historyRaw || historyRaw.length === 0) return [];

        const byId = {}; // id -> array of {x,y,genre}

        for (let f = 0; f < historyRaw.length; f++) {
            const frame = historyRaw[f] || [];
            for (let j = 0; j < frame.length; j++) {
                const p = frame[j];
                if (!p) continue;

                const id = typeof p.id !== "undefined" ? p.id : j;
                const x = Number(p.x);
                const y = Number(p.y);

                if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;

                if (!byId[id]) byId[id] = [];
                byId[id].push({
                    x: x,
                    y: y,
                    genre: typeof p.genre !== "undefined" ? p.genre : null,
                });
            }
        }

        const minX = bounds.minX;
        const maxX = bounds.maxX;
        const minY = bounds.minY;
        const maxY = bounds.maxY;

        const denomX = maxX - minX || 1;
        const denomY = maxY - minY || 1;

        function toNorm(x, y) {
            return {
                nx: (x - minX) / denomX,
                ny: (y - minY) / denomY,
            };
        }

        const paths = [];
        for (const id in byId) {
            const pts = byId[id];
            if (!pts || pts.length === 0) continue;

            let d = "";
            for (let k = 0; k < pts.length; k++) {
                const p = pts[k];
                const nrm = toNorm(p.x, p.y);
                const sc = toScreen(clamp(nrm.nx, 0, 1), clamp(nrm.ny, 0, 1));
                d += (k === 0 ? "M " : " L ") + sc.x.toFixed(2) + " " + sc.y.toFixed(2);
            }

            const last = pts[pts.length - 1];
            const genre = last && last.genre != null ? last.genre : null;

            paths.push({ id: id, d: d, genre: genre });
        }

        return paths;
    }, [historyRaw, bounds]);

    // Safe label formatting
    const minYText = isFiniteNumber(bounds.minY) ? bounds.minY.toFixed(2) : "0.00";
    const maxYText = isFiniteNumber(bounds.maxY) ? bounds.maxY.toFixed(2) : "0.00";
    const minXText = isFiniteNumber(bounds.minX) ? bounds.minX.toFixed(2) : "0.00";
    const maxXText = isFiniteNumber(bounds.maxX) ? bounds.maxX.toFixed(2) : "0.00";

    return (
        <svg
            width="100%"
            height="100%"
            viewBox={"0 0 " + width + " " + height}
            style={{ borderRadius: 14, background: "rgba(0,0,0,0.22)" }}
        >
            {/* axes */}
            <line
                x1={pad}
                y1={height - pad}
                x2={width - pad}
                y2={height - pad}
                stroke="rgba(255,255,255,0.18)"
            />
            <line
                x1={pad}
                y1={pad}
                x2={pad}
                y2={height - pad}
                stroke="rgba(255,255,255,0.18)"
            />

            {/* labels */}
            <text x={pad} y={14} fill="rgba(255,255,255,0.6)" fontSize="11">
                {"y: " + minYText + " to " + maxYText}
            </text>
            <text x={width - pad - 180} y={height - 6} fill="rgba(255,255,255,0.6)" fontSize="11">
                {"x: " + minXText + " to " + maxXText}
            </text>

            {/* trails */}
            {trails.map((t) => {
                const hue = t.genre != null ? hashHue(t.genre) : 210;
                return (
                    <path
                        key={"trail-" + t.id}
                        d={t.d}
                        fill="none"
                        stroke={"hsla(" + hue + ", 80%, 65%, 0.22)"}
                        strokeWidth="1.2"
                    />
                );
            })}

            {/* points */}
            {normalized.map((p) => {
                const sc = toScreen(clamp(p.nx, 0, 1), clamp(p.ny, 0, 1));
                const hue = p.genre != null ? hashHue(p.genre) : 210;

                return (
                    <g key={p.id}>
                        <circle cx={sc.x} cy={sc.y} r="5.0" fill={"hsla(" + hue + ", 85%, 62%, 0.85)"} />
                        <circle cx={sc.x} cy={sc.y} r="10.5" fill={"hsla(" + hue + ", 85%, 62%, 0.10)"} />
                    </g>
                );
            })}
        </svg>
    );
}