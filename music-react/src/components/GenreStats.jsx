import React, { useMemo } from "react";

/**
 * GenreStats — replaces the broken 3D view.
 * Shows two panels side by side:
 *   1. Genre Cluster Breakdown — bar chart of artist count per genre
 *   2. Artist Influence Leaderboard — top 10 most influential artists
 */

function hashHue(n) {
    return ((n * 97) % 360 + 360) % 360;
}

function getGenreName(id, isExperimental) {
    if (isExperimental) return "Experimental";
    const names = [
        "Pop", "Heavy Metal", "Blues", "Ambient",
        "Folk", "Electronic", "K-pop", "Experimental",
        "Jazz", "Classical", "Rock", "Traditional World",
    ];
    return names[id % names.length];
}

export default function GenreStats({ nodes = [], genres = [] }) {

    // --- Genre Cluster Breakdown ---
    const genreData = useMemo(() => {
        if (!nodes.length || !genres.length) return [];

        const counts = {};
        const maxGenre = Math.max(...genres);

        for (let i = 0; i < genres.length; i++) {
            const g = genres[i];
            if (!counts[g]) counts[g] = { id: g, count: 0, totalInfluence: 0 };
            counts[g].count++;
            counts[g].totalInfluence += nodes[i]?.influence ?? 0;
        }

        return Object.values(counts)
            .sort((a, b) => b.count - a.count)
            .map((g) => ({
                ...g,
                isExperimental: g.id === maxGenre && g.count < 5,
                avgInfluence: g.totalInfluence / g.count,
            }));
    }, [nodes, genres]);

    // --- Influence Leaderboard ---
    const leaderboard = useMemo(() => {
        if (!nodes.length) return [];
        return [...nodes]
            .sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0))
            .slice(0, 10)
            .map((n, rank) => ({
                rank: rank + 1,
                id: n.id,
                influence: n.influence ?? 0,
                genre: genres[n.id] ?? null,
            }));
    }, [nodes, genres]);

    const maxCount = genreData[0]?.count || 1;

    return (
        <div style={s.container}>

            {/* ── Genre Cluster Breakdown ── */}
            <div style={s.panel}>
                <div style={s.panelTitle}>Genre Clusters</div>
                <div style={s.subtitle}>{genreData.length} active genres</div>

                <div style={s.barList}>
                    {genreData.map((g) => {
                        const hue = hashHue(g.id);
                        const pct = (g.count / maxCount) * 100;
                        return (
                            <div key={g.id} style={s.barRow}>
                                <div style={s.barLabel}>
                                    <span style={{
                                        ...s.colorDot,
                                        background: `hsl(${hue}, 75%, 58%)`,
                                        boxShadow: `0 0 6px hsla(${hue}, 80%, 58%, 0.5)`,
                                    }} />
                                    <span style={s.genreName}>
                                        {getGenreName(g.id, g.isExperimental)}
                                        {g.isExperimental &&
                                            <span style={s.expBadge}>⚡ fringe</span>
                                        }
                                    </span>
                                    <span style={s.countBadge}>{g.count}</span>
                                </div>
                                <div style={s.barTrack}>
                                    <div style={{
                                        ...s.barFill,
                                        width: pct + "%",
                                        background: `linear-gradient(90deg,
                                            hsla(${hue}, 75%, 52%, 0.9),
                                            hsla(${hue}, 85%, 68%, 0.6))`,
                                        boxShadow: `0 0 8px hsla(${hue}, 80%, 55%, 0.3)`,
                                    }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Artist Influence Leaderboard ── */}
            <div style={s.panel}>
                <div style={s.panelTitle}>Influence Leaderboard</div>
                <div style={s.subtitle}>Top 10 most connected artists</div>

                <div style={s.leaderList}>
                    {leaderboard.map((entry) => {
                        const hue = entry.genre != null ? hashHue(entry.genre) : 210;
                        const barW = (entry.influence * 100).toFixed(1);
                        const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
                        return (
                            <div key={entry.id} style={s.leaderRow}>
                                <span style={s.rank}>
                                    {medal || <span style={s.rankNum}>{entry.rank}</span>}
                                </span>
                                <span style={{
                                    ...s.colorDot,
                                    background: `hsl(${hue}, 75%, 58%)`,
                                    flexShrink: 0,
                                }} />
                                <span style={s.artistLabel}>Artist {entry.id}</span>
                                <div style={s.leaderBarTrack}>
                                    <div style={{
                                        ...s.leaderBarFill,
                                        width: barW + "%",
                                        background: `linear-gradient(90deg,
                                            hsla(${hue}, 75%, 52%, 0.85),
                                            hsla(${hue}, 85%, 68%, 0.5))`,
                                    }} />
                                </div>
                                <span style={s.influenceVal}>
                                    {(entry.influence * 100).toFixed(0)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const s = {
    container: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
        height: "100%",
        minHeight: 480,
    },
    panel: {
        background: "rgba(0,0,0,0.22)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflow: "hidden",
    },
    panelTitle: {
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(255,255,255,0.9)",
        letterSpacing: 0.3,
    },
    subtitle: {
        fontSize: 11,
        color: "rgba(255,255,255,0.4)",
        marginBottom: 6,
    },
    barList: {
        display: "flex",
        flexDirection: "column",
        gap: 9,
        overflowY: "auto",
        flex: 1,
    },
    barRow: {
        display: "flex",
        flexDirection: "column",
        gap: 4,
    },
    barLabel: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
    },
    colorDot: {
        width: 8,
        height: 8,
        borderRadius: "50%",
        flexShrink: 0,
    },
    genreName: {
        color: "rgba(255,255,255,0.8)",
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 5,
    },
    expBadge: {
        fontSize: 10,
        color: "rgba(255,200,80,0.8)",
        background: "rgba(255,200,80,0.12)",
        borderRadius: 4,
        padding: "1px 5px",
    },
    countBadge: {
        fontSize: 11,
        color: "rgba(255,255,255,0.45)",
        fontVariantNumeric: "tabular-nums",
    },
    barTrack: {
        height: 5,
        borderRadius: 3,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden",
    },
    barFill: {
        height: "100%",
        borderRadius: 3,
        transition: "width 0.4s ease",
    },
    leaderList: {
        display: "flex",
        flexDirection: "column",
        gap: 7,
        overflowY: "auto",
        flex: 1,
    },
    leaderRow: {
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: 12,
    },
    rank: {
        width: 20,
        textAlign: "center",
        fontSize: 13,
        flexShrink: 0,
    },
    rankNum: {
        color: "rgba(255,255,255,0.3)",
        fontSize: 11,
    },
    artistLabel: {
        color: "rgba(255,255,255,0.75)",
        width: 58,
        flexShrink: 0,
    },
    leaderBarTrack: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden",
    },
    leaderBarFill: {
        height: "100%",
        borderRadius: 3,
        transition: "width 0.4s ease",
    },
    influenceVal: {
        width: 24,
        textAlign: "right",
        color: "rgba(255,255,255,0.4)",
        fontSize: 11,
        fontVariantNumeric: "tabular-nums",
    },
};