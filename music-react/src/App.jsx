import { useEffect, useRef, useState } from 'react';
import Graph3D from './components/Graph3D';
import Controls from './components/Controls';

export default function App() {
    const [timestep, setTimestep] = useState(0);
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const wsRef = useRef(null);

    useEffect(() => {
        const ws = new WebSocket("ws://127.0.0.1:8000/ws");
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const frame = JSON.parse(event.data);
            setTimestep(frame.t ?? 0);
            setGraphData({ nodes: frame.nodes ?? [], links: frame.links ?? [] });
        };

        return () => ws.close();
    }, []);

    const send = (obj) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== 1) return;
        ws.send(JSON.stringify(obj));
    };

    return (
        <div style={{ height: "100vh", background: "#05060a" }}>
            <Graph3D graphData={graphData} />
            <Controls
                timestep={timestep}
                onPlay={() => send({ type: "play" })}
                onPause={() => send({ type: "pause" })}
                onStep={() => send({ type: "step" })}
            />
        </div>
    );
}