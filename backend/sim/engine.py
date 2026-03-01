# -*- coding: utf-8 -*-
import numpy as np
import networkx as nx
from sklearn.decomposition import PCA
from sklearn.cluster import DBSCAN
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
        # weight matrix W[i,j] = normalized influence of j on i
        self.w = {i: {} for i in range(cfg.N)}
        for i in range(cfg.N):
            for j in self.G.neighbors(i):
                self.w[i][j] = float(np.random.rand())
        self._normalize_weights()
        # precompute W as dense matrix for vectorized step
        N = cfg.N
        self.W = np.array(
            [[self.w[i].get(j, 0.0) for j in range(N)] for i in range(N)],
            dtype=np.float32,
        )
        # initial genre labels via clustering
        self.labels = np.zeros(cfg.N, dtype=np.int32)
        self.pca3 = PCA(n_components=3, random_state=42)
        self._pca_fitted = False

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

    def _cluster_labels(self):
        db = DBSCAN(eps=0.3, min_samples=3).fit(self.X)
        labels = db.labels_.copy()
        labels[labels == -1] = 0  # remap noise to group 0
        self.labels = labels.astype(np.int32)

    def update_params(self, params: dict):
        for k, v in params.items():
            if hasattr(self.cfg, k):
                setattr(self.cfg, k, float(v))

    def step(self):
        cfg = self.cfg
        N, d = cfg.N, cfg.d
        # vectorized influence: W @ X gives weighted neighbor mean for each node
        influence = self.W @ self.X  # (N, d)
        # innovation noise applied per-node with probability p
        noise = np.where(
            (np.random.rand(N) < cfg.p)[:, None],
            np.random.normal(0.0, cfg.sigma, (N, d)).astype(np.float32),
            0.0,
        )
        a = self.alpha[:, None]
        self.X = np.clip((1 - a) * self.X + a * influence + noise, 0.0, 1.0)
        self.t += 1
        # recluster every 10 steps
        if self.t % 10 == 0:
            self._cluster_labels()

    def export_frame(self) -> dict:
        # fit PCA once, then reuse the same axes every frame
        if not self._pca_fitted:
            self.pca3.fit(self.X)
            self._pca_fitted = True
        Xp = self.pca3.transform(self.X).astype(np.float32)
        Xp *= self.cfg.pos_scale
        # influence score = normalized degree centrality
        deg = np.array(
            [self.G.degree(i) for i in range(self.cfg.N)], dtype=np.float32
        )
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
            links.append({"source": int(u), "target": int(v), "w": float(0.5 * (wu + wv))})
        return {"t": self.t, "nodes": nodes, "links": links}