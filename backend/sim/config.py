from dataclasses import dataclass

@dataclass
class SimConfig:
    N: int = 120        # artists
    d: int = 8          # style dimensions
    k: int = 8          # avg degree
    beta: float = 0.10  # small-world rewiring

    p: float = 0.03     # innovation probability
    sigma: float = 0.04 # innovation noise

    pos_scale: float = 140.0  # visual scaling