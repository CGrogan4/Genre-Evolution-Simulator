import React, { useEffect, useMemo, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";

/**
 * 3D force-directed graph visualization.
 * Nodes are artists, edges are influence relationships.
 * Colors can reflect genre cluster or style properties if available.
 */

function hashToColor(n) {
    // deterministic pseudo-random color
    const x = Math.abs((n * 9301 + 49297) % 233280) / 233280;
    const y = Math.abs((n * 233280 + 49297) % 9301) / 9301;
    const z = Math.abs((n * 49297 + 233280) % 9301) / 9301;
    return new THREE.Color(x, y, z);
}

function getArrayItem(arr, idx, fallback) {
    if (!arr || typeof idx !== "number") return fallback;
    if (idx < 0 || idx >= arr.length) return fallback;
    const v = arr[idx];
    return typeof v === "undefined" || v === null ? fallback : v;
}

function getFirstNumber(arr, fallback) {
    if (!arr || arr.length === 0) return fallback;
    const v = arr[0];
    return typeof v === "number" ? v : fallback;
}

export default function Graph3D(props) {
    const nodes = props.nodes || [];
    const links = props.links || [];
    const styles = props.styles || [];
    const genres = props.genres || [];

    const fgRef = useRef(null);

    const graphData = useMemo(() => {
        const n = (nodes || []).map((node, i) => {
            const vec = getArrayItem(styles, i, []);
            const g = getArrayItem(genres, i, null);

            const id = node && typeof node.id !== "undefined" ? node.id : i;
            const label =
                node && typeof node.label !== "undefined" ? node.label : "Artist " + i;

            return {
                id: id,
                idx: i,
                label: label,
                style: vec,
                genre: g,
            };
        });

        const l = (links || []).map((e, i) => {
            const source =
                (e && typeof e.source !== "undefined" ? e.source : undefined) ||
                (e && typeof e.from !== "undefined" ? e.from : undefined) ||
                (e && typeof e.u !== "undefined" ? e.u : undefined) ||
                (e && typeof e.a !== "undefined" ? e.a : undefined) ||
                (Array.isArray(e) ? e[0] : undefined);

            const target =
                (e && typeof e.target !== "undefined" ? e.target : undefined) ||
                (e && typeof e.to !== "undefined" ? e.to : undefined) ||
                (e && typeof e.v !== "undefined" ? e.v : undefined) ||
                (e && typeof e.b !== "undefined" ? e.b : undefined) ||
                (Array.isArray(e) ? e[1] : undefined);

            const weight =
                (e && typeof e.weight !== "undefined" ? e.weight : undefined) ||
                (e && typeof e.w !== "undefined" ? e.w : undefined) ||
                1;

            const id = e && typeof e.id !== "undefined" ? e.id : i;

            return {
                source: source,
                target: target,
                weight: weight,
                id: id,
            };
        });

        return { nodes: n, links: l };
    }, [nodes, links, styles, genres]);

    // Fit graph after data changes
    useEffect(() => {
        if (!fgRef.current) return;
        const t = setTimeout(() => {
            try {
                fgRef.current.zoomToFit(700, 60);
            } catch (e) {
                // ignore
            }
        }, 200);
        return () => clearTimeout(t);
    }, [graphData]);

    const nodeColor = (node) => {
        if (node && node.genre != null) return hashToColor(node.genre);

        // fallback: use first style dimension as a color cue
        const v = getFirstNumber(node && node.style ? node.style : null, 0.5);
        return new THREE.Color().setHSL(((v % 1) + 1) % 1, 0.65, 0.55);
    };

    const nodeThreeObject = (node) => {
        const geom = new THREE.SphereGeometry(3.2, 16, 16);
        const col = nodeColor(node);
        const mat = new THREE.MeshStandardMaterial({
            color: col,
            roughness: 0.55,
            metalness: 0.1,
            emissive: col.clone().multiplyScalar(0.15),
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { nodeId: node ? node.id : undefined };
        return mesh;
    };

    const linkColor = (link) => {
        const w = link && typeof link.weight !== "undefined" ? link.weight : 1;
        const c = new THREE.Color().setHSL(0.58, 0.25, 0.5);
        const alpha = Math.min(0.9, 0.18 + 0.06 * w);

        return (
            "rgba(" +
            Math.floor(c.r * 255) +
            ", " +
            Math.floor(c.g * 255) +
            ", " +
            Math.floor(c.b * 255) +
            ", " +
            alpha +
            ")"
        );
    };

    const nodeLabel = (node) => {
        const label = node && node.label ? node.label : "Artist";
        const genre = node && node.genre != null ? node.genre : "?";
        const styleArr = node && node.style ? node.style : [];
        const preview = styleArr
            .slice(0, 4)
            .map((x) => Number(x).toFixed(2))
            .join(", ");
        const suffix = styleArr.length > 4 ? ", ..." : "";
        return label + "\nGenre: " + genre + "\nStyle: [" + preview + suffix + "]";
    };

    return (
        <div style={{ height: "100%", width: "100%", borderRadius: 14, overflow: "hidden" }}>
            <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                backgroundColor="rgba(0,0,0,0)"
                showNavInfo={false}
                nodeLabel={nodeLabel}
                nodeThreeObject={nodeThreeObject}
                nodeRelSize={4}
                linkWidth={(l) => Math.max(0.4, ((l && l.weight) ? l.weight : 1) * 0.4)}
                linkColor={linkColor}
                linkOpacity={0.55}
                linkDirectionalParticles={1}
                linkDirectionalParticleWidth={1.1}
                linkDirectionalParticleSpeed={(l) => 0.003 + 0.001 * ((l && l.weight) ? l.weight : 1)}
                cooldownTicks={80}
            />
        </div>
    );
}