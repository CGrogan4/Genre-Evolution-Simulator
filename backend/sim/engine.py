import numpy as np
import datetime
import networkx as nx
from sklearn.decomposition import PCA
from sklearn.cluster import DBSCAN
from .config import SimConfig


class SimulationEngine:

    def __init__(self, cfg: SimConfig):
        self.cfg = cfg
        self.t = 0

        # Reproducible RNG — all random calls go through this so seed is respected
        self.rng = np.random.default_rng(cfg.seed)

        # Network
        self.G = nx.watts_strogatz_graph(cfg.N, cfg.k, cfg.beta, seed=cfg.seed)

        # Styles in [0, 1]^d
        self.X = self.rng.random((cfg.N, cfg.d)).astype(np.float32)

        # Susceptibility alpha_i ~ Beta(2,5) scaled to [0.05, 0.6]
        a = self.rng.beta(2, 5, size=cfg.N).astype(np.float32)
        self.alpha = (0.05 + 0.55 * a).astype(np.float32)

        # Decay alpha toward 0 as degree centrality increases
        deg_centrality = np.array(
            [nx.degree_centrality(self.G)[i] for i in range(cfg.N)],
            dtype=np.float32,
        )
        self.alpha = np.clip(
            self.alpha - cfg.alpha_decay * deg_centrality, 0.05, 0.6
        )

        # Weight matrix W[i,j] = normalised influence of j on i
        self.w = {i: {} for i in range(cfg.N)}
        for i in range(cfg.N):
            for j in self.G.neighbors(i):
                self.w[i][j] = float(self.rng.random())
        self._normalize_weights()

        # Dense W matrix for vectorised step
        N = cfg.N
        self.W = np.array(
            [[self.w[i].get(j, 0.0) for j in range(N)] for i in range(N)],
            dtype=np.float32,
        )

        # Genre labels — initialised properly so tick 0 has real cluster colours
        self.labels = np.zeros(cfg.N, dtype=np.int32)

        #Fit PCA once and never refit — keeps scatter axes stable across the run
        self.pca = PCA(n_components=min(3, cfg.d), random_state=cfg.seed)
        self.pca.fit(self.X)

        # Cache betweenness centrality — expensive, refresh every 50 steps
        self._betweenness = self._compute_betweenness()
        self._cluster_labels()

        # Data collection log — list of dicts, one per step
        self.run_log: list[dict] = []

    def _compute_betweenness(self) -> np.ndarray:
        bc = nx.betweenness_centrality(self.G, normalized=True)
        arr = np.array([bc[i] for i in range(self.cfg.N)], dtype=np.float32)
        rng = arr.max() - arr.min()
        if rng > 1e-9:
            arr = (arr - arr.min()) / rng
        return arr

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
        d = self.cfg.d
        spread = np.mean(np.std(self.X, axis=0))
        natural_scale = np.sqrt(d / 6.0)
        eps = float(np.clip(spread * natural_scale * 1.2, 0.08, 0.8))

        db = DBSCAN(eps=eps, min_samples=3).fit(self.X)
        labels = db.labels_.copy()

        # each getting its own unique label (which was creating dozens of fake genres).
        if np.any(labels == -1):
            core_max = int(labels[labels != -1].max()) if np.any(labels != -1) else -1
            labels[labels == -1] = core_max + 1

        self.labels = labels.astype(np.int32)

    def _collect_metrics(self):
        """Snapshot of key metrics for the run log."""
        unique_genres = len(np.unique(self.labels))
        genre_counts = np.bincount(self.labels)
        largest_genre = int(genre_counts.max())
        mean_style_spread = float(np.mean(np.std(self.X, axis=0)))
        mean_alpha = float(np.mean(self.alpha))
        return {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "tick":              self.t,
            "unique_genres":     unique_genres,
            "largest_genre_n":   largest_genre,
            "mean_style_spread": round(mean_style_spread, 5),
            "mean_alpha":        round(mean_alpha, 5),
        }

    def update_params(self, params: dict):
        for k, v in params.items():
            if hasattr(self.cfg, k):
                setattr(self.cfg, k, float(v))

    def step(self):
        cfg = self.cfg
        N, d = cfg.N, cfg.d

        # Homophily-weighted influence
        diff = self.X[:, None, :] - self.X[None, :, :]
        dist = np.linalg.norm(diff, axis=-1).astype(np.float32)
        similarity = 1.0 - dist / np.sqrt(cfg.d)
        W_hom = self.W * similarity
        row_sums = W_hom.sum(axis=1, keepdims=True)
        row_sums = np.where(row_sums < 1e-9, 1.0, row_sums)
        W_hom /= row_sums

        influence = W_hom @ self.X

        # Innovation noise
        noise = np.where(
            (self.rng.random(N) < cfg.p)[:, None],
            self.rng.normal(0.0, cfg.sigma, (N, d)).astype(np.float32),
            0.0,
        )
        a = self.alpha[:, None]
        self.X = np.clip((1 - a) * self.X + a * influence + noise, 0.0, 1.0)
        self.t += 1

        # Recluster every 10 steps
        if self.t % 10 == 0:
            self._cluster_labels()

        # Refresh betweenness every 50 steps
        if self.t % 50 == 0:
            self._betweenness = self._compute_betweenness()

        # Record metrics every step for data export
        self.run_log.append(self._collect_metrics())

    def export_frame(self) -> dict:
        # Use the single stable PCA fitted at init — no axis drift
        Xp = self.pca.transform(self.X).astype(np.float32)
        Xp *= self.cfg.pos_scale

        influence = self._betweenness

        nodes = [
            {
                "id":        int(i),
                "group":     int(self.labels[i]),
                "influence": float(influence[i]),
                "x":         float(Xp[i, 0]),
                "y":         float(Xp[i, 1]),
                "z":         float(Xp[i, 2]) if Xp.shape[1] > 2 else 0.0,
            }
            for i in range(self.cfg.N)
        ]
        links = []
        for u, v in self.G.edges():
            wu = self.w[u].get(v, 0.0)
            wv = self.w[v].get(u, 0.0)
            links.append(
                {"source": int(u), "target": int(v), "w": float(0.5 * (wu + wv))}
            )
        return {"t": self.t, "nodes": nodes, "links": links}

    def export_run_log(self) -> list[dict]:
        """Return the full per-step metrics log for CSV/JSON export."""
        return self.run_log