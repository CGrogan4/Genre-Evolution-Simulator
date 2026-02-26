import numpy as np
import networkx as nx
from sklearn.decomposition import PCA
from .config import SimConfig

class SimulationEngine:
    def __init__(self, cfg: SimConfig):
        self.cfg = cfg
        self.t = 0

        # network
        self.G = nx.watts_strogatz_graph(cfg.N, cfg.k, cfg.beta, seed=42)

        # styles in [0,1]^d
        self.X = np.random.rand(cfg.N, cfg.d).astype(np.float32)

        # susceptibility alpha_i ~ Beta(2,5) scaled to [0.05, 0.6]
        a = np.random.beta(2, 5, size=cfg.N).astype(np.float32)
        self.alpha = (0.05 + 0.55 * a).astype(np.float32)

        # weights w_ij normalized over neighbors of i
        self.w = {i: {} for i in range(cfg.N)}
        for i in range(cfg.N):
            for j in self.G.neighbors(i):
                self.w[i][j] = float(np.random.rand())
        self._normalize_weights()

        # “genre” labels (simple: random to start; we’ll swap to DBSCAN next)
        self.labels = np.random.randint(0, 6, size=cfg.N).astype(np.int32)

        self.pca3 = PCA(n_components=3, random_state=42)

    def _normalize_weights(self):
        for i, nbrs in self.w.items():
            if not nbrs:
                continue
            s = sum(nbrs.values())
            if s <= 1e-12:
                val = 1.0 / len(nbrs)
                for j in nbrs:
                    nbrs[j] = val
            else:
                for j in nbrs:
                    nbrs[j] /= s

    def update_params(self, params: dict):
        for k, v in params.items():
            if hasattr(self.cfg, k):
                setattr(self.cfg, k, float(v))

    def step(self):
        cfg = self.cfg
        N, d = cfg.N, cfg.d
        X_new = np.empty_like(self.X)

        for i in range(N):
            nbrs = list(self.w[i].keys())
            if nbrs:
                weights = np.array([self.w[i][j] for j in nbrs], dtype=np.float32)
                neigh = self.X[np.array(nbrs, dtype=np.int32)]
                influence = (weights[:, None] * neigh).sum(axis=0)
            else:
                influence = self.X[i]

            # innovation event
            if np.random.rand() < cfg.p:
                noise = np.random.normal(0.0, cfg.sigma, size=d).astype(np.float32)
            else:
                noise = 0.0

            a = self.alpha[i]
            x = (1 - a) * self.X[i] + a * influence + noise
            X_new[i] = np.clip(x, 0.0, 1.0)

        self.X = X_new
        self.t += 1

        # temporary “genre drift” so colors change (we’ll replace with clustering)
        if self.t % 25 == 0:
            flip = np.random.rand(N) < 0.08
            self.labels[flip] = np.random.randint(0, 6, size=int(flip.sum()))

    def export_frame(self) -> dict:
        # project styles to 3D
        Xp = self.pca3.fit_transform(self.X + 1e-6*np.random.randn(*self.X.shape)).astype(np.float32)
        Xp *= self.cfg.pos_scale

        # influence score = normalized degree
        deg = np.array([self.G.degree(i) for i in range(self.cfg.N)], dtype=np.float32)
        deg = (deg - deg.min()) / (deg.max() - deg.min() + 1e-9)

        nodes = [
            {
                "id": int(i),
                "group": int(self.labels[i]),
                "influence": float(deg[i]),
                "x": float(Xp[i, 0]),
                "y": float(Xp[i, 1]),
                "z": float(Xp[i, 2]),
            }
            for i in range(self.cfg.N)
        ]

        links = []
        for u, v in self.G.edges():
            wu = self.w[u].get(v, 0.0)
            wv = self.w[v].get(u, 0.0)
            links.append({"source": int(u), "target": int(v), "w": float(0.5*(wu+wv))})

        return {"t": self.t, "nodes": nodes, "links": links}