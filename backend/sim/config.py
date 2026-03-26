from dataclasses import dataclass

@dataclass
class SimConfig:
    N: int = 120
    d: int = 8
    k: int = 8
    beta: float = 0.10
    p: float = 0.03
    sigma: float = 0.04
    alpha_decay: float = 0.3
    pos_scale: float = 140.0
    seed: int = 42