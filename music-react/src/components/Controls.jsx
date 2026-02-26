export default function Controls({ onStep, onPlay, onPause, timestep }) {
    return (
        <div style={{
            position: "absolute",
            top: 20,
            left: 20,
            background: "rgba(0,0,0,0.5)",
            padding: 12,
            borderRadius: 10,
            color: "white"
        }}>
            <div style={{ marginBottom: 8 }}>Timestep: {timestep}</div>
            <button onClick={onPlay}>Play</button>
            <button onClick={onPause} style={{ marginLeft: 6 }}>Pause</button>
            <button onClick={onStep} style={{ marginLeft: 6 }}>Step</button>
        </div>
    );
}