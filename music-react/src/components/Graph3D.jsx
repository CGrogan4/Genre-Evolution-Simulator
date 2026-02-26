import ForceGraph3D from 'react-force-graph-3d';
import { useRef, useEffect } from 'react';

export default function Graph3D({ graphData }) {
    const fgRef = useRef();

    // Start with a good camera position
    useEffect(() => {
        if (!fgRef.current) return;
        fgRef.current.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 1200);
    }, []);

    return (
        <ForceGraph3D
            ref={fgRef}
            graphData={graphData}
            backgroundColor="#05060a"

            // Make it readable + interactive
            nodeLabel={(n) => `Artist ${n.id} | genre ${n.group ?? "?"}`}
            linkLabel={(l) => `w=${(l.w ?? 0).toFixed(2)}`}

            // Better sizing + spacing
            nodeVal={(n) => 6 + (n.influence ?? 0) * 18}
            linkWidth={(l) => 0.8 + (l.w ?? 0) * 3.5}
            linkOpacity={0.25}

            // Color by group (genre)
            nodeAutoColorBy="group"

            // Physics tweaks
            d3VelocityDecay={0.25}
            d3AlphaDecay={0.02}

            // Click a node to zoom/focus
            onNodeClick={(node) => {
                const distance = 90;
                const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

                fgRef.current.cameraPosition(
                    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                    node,
                    800
                );
            }}
        />
    );
}