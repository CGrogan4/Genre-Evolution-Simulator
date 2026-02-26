import { useState, useEffect } from 'react';
import Graph3D from './components/Graph3D';
import Controls from './components/Controls';

// Helper function to generate a random network
function generateGraph(N = 60) {
    const nodes = Array.from({ length: N }, (_, i) => ({
        id: i,
        group: Math.floor(Math.random() * 6), // fake genres
        influence: Math.random()
    }));

    const links = Array.from({ length: N * 1.5 }, () => {
        const source = Math.floor(Math.random() * N);
        let target = Math.floor(Math.random() * N);
        if (target === source) target = (target + 1) % N;
        return { source, target, w: Math.random() };
    });

    return { nodes, links };
}

function App() {
    const [timestep, setTimestep] = useState(0);
    const [running, setRunning] = useState(false);
    const [graphData, setGraphData] = useState(generateGraph());

    useEffect(() => {
        if (!running) return;

        const interval = setInterval(() => {
            setTimestep(t => t + 1);
            setGraphData(generateGraph()); // regenerate graph each tick
        }, 800);

        return () => clearInterval(interval);
    }, [running]);

    const handleStep = () => {
        setTimestep(t => t + 1);
        setGraphData(generateGraph());
    };

    return (
        <div style={{ height: "100vh", background: "#05060a" }}>
            <Graph3D graphData={graphData} />
            <Controls
                timestep={timestep}
                onPlay={() => setRunning(true)}
                onPause={() => setRunning(false)}
                onStep={handleStep}
            />
        </div>
    );
}

export default App;