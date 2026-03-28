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

        # Reproducible RNG
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

        # Genre labels
        self.labels = np.zeros(cfg.N, dtype=np.int32)

        # PCA fitted once at init — keeps scatter axes stable
        self.pca = PCA(n_components=min(3, cfg.d), random_state=cfg.seed)
        self.pca.fit(self.X)

        # Betweenness centrality cache
        self._betweenness = self._compute_betweenness()

        # Cluster on init so genres are correct from tick 0
        self._cluster_labels()

        # ------------------------------------------------------------------
        # Data collection
        # ------------------------------------------------------------------

        # Time-series log — one entry per tick
        self.run_log: list[dict] = []

        # Event log — one entry per discrete event detected
        self.event_log: list[dict] = []

        # Track previous genre labels so we can detect transitions
        self._prev_labels = self.labels.copy()

        # Track previous innovation count for throughput
        self._total_innovations = 0
        self._total_genre_transitions = 0

        # Record tick-0 snapshot
        self.run_log.append(self._collect_metrics(innovations_this_tick=0))

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

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

        # All noise points share one "Experimental" label
        if np.any(labels == -1):
            core_max = int(labels[labels != -1].max()) if np.any(labels != -1) else -1
            labels[labels == -1] = core_max + 1

        self.labels = labels.astype(np.int32)

    def _now(self) -> str:
        return datetime.datetime.utcnow().isoformat()

    # ------------------------------------------------------------------
    # Data collection helpers
    # ------------------------------------------------------------------

    def _per_genre_counts(self) -> dict:
        """Artist count per genre label — entity counts and statuses."""
        counts = {}
        for label in self.labels:
            key = f"genre_{int(label)}_count"
            counts[key] = counts.get(key, 0) + 1
        return counts

    def _network_utilization(self, W_hom: np.ndarray) -> float:
        """
        Fraction of influence edges that are meaningfully active (weight > 0.01).
        Analogous to resource utilization — how much of the network is
        actively transmitting influence this tick.
        """
        active = float(np.sum(W_hom > 0.01))
        total  = float(W_hom.size)
        return round(active / total, 5) if total > 0 else 0.0

    def _collect_metrics(
        self,
        innovations_this_tick: int = 0,
        network_utilization: float = 0.0,
        genre_transitions: int = 0,
        W_hom: np.ndarray | None = None,
    ) -> dict:
        """
        TIME-SERIES snapshot — one row per tick in the run log.
        Covers: system state, entity counts, utilization, throughput.
        """
        unique_genres  = int(len(np.unique(self.labels)))
        genre_counts   = np.bincount(self.labels)
        largest_genre  = int(genre_counts.max())
        smallest_genre = int(genre_counts.min())

        # Style spread = how spread out artists are (analogous to queue depth —
        # high spread means artists are dispersed, low = converging)
        mean_spread = float(np.mean(np.std(self.X, axis=0)))
        max_spread  = float(np.max(np.std(self.X, axis=0)))
        min_spread  = float(np.min(np.std(self.X, axis=0)))

        # Mean pairwise distance — how far apart artists are on average
        # Expensive for large N so sample if N > 100
        N = self.cfg.N
        if N <= 100:
            dists = np.linalg.norm(
                self.X[:, None, :] - self.X[None, :, :], axis=-1
            )
            mean_pairwise_dist = float(np.mean(dists))
        else:
            idx = self.rng.integers(0, N, size=100)
            sample = self.X[idx]
            dists = np.linalg.norm(sample[:, None, :] - sample[None, :, :], axis=-1)
            mean_pairwise_dist = float(np.mean(dists))

        row = {
            # --- Identity ---
            "timestamp":             self._now(),
            "tick":                  self.t,

            # --- System state (time-series) ---
            "unique_genres":         unique_genres,
            "largest_genre_n":       largest_genre,
            "smallest_genre_n":      smallest_genre,
            "mean_style_spread":     round(mean_spread,  5),
            "max_style_spread":      round(max_spread,   5),
            "min_style_spread":      round(min_spread,   5),
            "mean_pairwise_dist":    round(mean_pairwise_dist, 5),

            # --- Resource utilization ---
            "network_utilization":   network_utilization,
            "mean_alpha":            round(float(np.mean(self.alpha)), 5),
            "mean_influence_weight": round(float(np.mean(list(
                v for nbrs in self.w.values() for v in nbrs.values()
            ))), 5),

            # --- Entity counts per genre (status tracking) ---
            **self._per_genre_counts(),

            # --- Throughput / event counts this tick ---
            "innovations_this_tick":    innovations_this_tick,
            "genre_transitions_this_tick": genre_transitions,

            # --- Cumulative throughput ---
            "total_innovations":        self._total_innovations,
            "total_genre_transitions":  self._total_genre_transitions,
        }
        return row

    def _detect_and_log_events(self, innovated_mask: np.ndarray):
        """
        EVENT LOG — records discrete events with type, timestamp, and context.
        Covers: event types, timestamps, state transitions, service completions.
        """
        now = self._now()

        # 1. Innovation events — artist made a random creative jump
        for i in np.where(innovated_mask)[0]:
            self.event_log.append({
                "timestamp":  now,
                "tick":       self.t,
                "event_type": "innovation",
                "artist_id":  int(i),
                "genre":      int(self.labels[i]),
                "description": f"Artist {i} made a creative innovation in genre {self.labels[i]}",
            })

        # 2. Genre transition events — artist moved from one genre to another
        transitions = np.where(self.labels != self._prev_labels)[0]
        for i in transitions:
            from_genre = int(self._prev_labels[i])
            to_genre   = int(self.labels[i])
            self.event_log.append({
                "timestamp":  now,
                "tick":       self.t,
                "event_type": "genre_transition",
                "artist_id":  int(i),
                "from_genre": from_genre,
                "to_genre":   to_genre,
                "description": f"Artist {i} transitioned from genre {from_genre} to genre {to_genre}",
            })

        # 3. Genre absorption events — a genre dropped to 0 artists (service completion)
        prev_genres = set(np.unique(self._prev_labels))
        curr_genres = set(np.unique(self.labels))
        absorbed    = prev_genres - curr_genres
        for g in absorbed:
            self.event_log.append({
                "timestamp":  now,
                "tick":       self.t,
                "event_type": "genre_absorbed",
                "genre":      int(g),
                "absorbed_by": int(self.labels[np.argmin(
                    np.linalg.norm(self.X - self.X.mean(axis=0), axis=1)
                )]),
                "description": f"Genre {g} was fully absorbed at tick {self.t}",
            })

        # 4. Genre emergence events — a new genre appeared
        emerged = curr_genres - prev_genres
        for g in emerged:
            count = int(np.sum(self.labels == g))
            self.event_log.append({
                "timestamp":  now,
                "tick":       self.t,
                "event_type": "genre_emerged",
                "genre":      int(g),
                "initial_size": count,
                "description": f"New genre {g} emerged at tick {self.t} with {count} artists",
            })

    def export_summary(self) -> dict:
        """
        SUMMARY STATISTICS — aggregate stats across the full run.
        Covers: averages, max/min observations, total counts, throughput.
        """
        if not self.run_log:
            return {}

        spreads      = [r["mean_style_spread"]   for r in self.run_log]
        genres       = [r["unique_genres"]        for r in self.run_log]
        utilizations = [r["network_utilization"]  for r in self.run_log]
        largest      = [r["largest_genre_n"]      for r in self.run_log]

        # Throughput = total innovations per tick
        total_ticks = max(self.t, 1)

        # Event type breakdown
        event_counts: dict[str, int] = {}
        for e in self.event_log:
            event_counts[e["event_type"]] = event_counts.get(e["event_type"], 0) + 1

        return {
            "run_duration_ticks":          self.t,
            "total_artists":               self.cfg.N,

            # Style spread — analogous to queue length over time
            "avg_style_spread":            round(float(np.mean(spreads)),  5),
            "max_style_spread":            round(float(np.max(spreads)),   5),
            "min_style_spread":            round(float(np.min(spreads)),   5),

            # Genre counts over time
            "avg_unique_genres":           round(float(np.mean(genres)),   2),
            "max_unique_genres":           int(np.max(genres)),
            "min_unique_genres":           int(np.min(genres)),

            # Dominant genre size over time
            "avg_largest_genre_n":         round(float(np.mean(largest)),  2),
            "max_largest_genre_n":         int(np.max(largest)),
            "peak_dominance_tick":         int(self.run_log[
                                               int(np.argmax(largest))
                                           ]["tick"]),

            # Network utilization
            "avg_network_utilization":     round(float(np.mean(utilizations)), 5),
            "max_network_utilization":     round(float(np.max(utilizations)),  5),

            # Throughput
            "total_innovations":           self._total_innovations,
            "total_genre_transitions":     self._total_genre_transitions,
            "innovation_rate_per_tick":    round(self._total_innovations     / total_ticks, 4),
            "transition_rate_per_tick":    round(self._total_genre_transitions / total_ticks, 4),

            # Event breakdown
            "event_counts":                event_counts,
            "total_events":                len(self.event_log),

            # Final state
            "final_unique_genres":         int(len(np.unique(self.labels))),
            "final_largest_genre_n":       int(np.bincount(self.labels).max()),
            "final_mean_style_spread":     round(float(np.mean(np.std(self.X, axis=0))), 5),
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

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

        # Innovation noise — track which artists innovated
        innovate_mask = self.rng.random(N) < cfg.p
        noise = np.where(
            innovate_mask[:, None],
            self.rng.normal(0.0, cfg.sigma, (N, d)).astype(np.float32),
            0.0,
        )

        innovations_this_tick = int(innovate_mask.sum())
        self._total_innovations += innovations_this_tick

        a = self.alpha[:, None]
        self.X = np.clip((1 - a) * self.X + a * influence + noise, 0.0, 1.0)
        self.t += 1

        # Recluster every 10 steps
        if self.t % 10 == 0:
            self._cluster_labels()

        # Refresh betweenness every 50 steps
        if self.t % 50 == 0:
            self._betweenness = self._compute_betweenness()

        # Count genre transitions since last tick
        genre_transitions = int(np.sum(self.labels != self._prev_labels))
        self._total_genre_transitions += genre_transitions

        # Log events (innovations, transitions, absorptions, emergences)
        self._detect_and_log_events(innovate_mask)

        # Network utilization this tick
        net_util = self._network_utilization(W_hom)

        # Record time-series metrics
        self.run_log.append(self._collect_metrics(
            innovations_this_tick=innovations_this_tick,
            network_utilization=net_util,
            genre_transitions=genre_transitions,
        ))

        # Update previous labels for next tick's transition detection
        self._prev_labels = self.labels.copy()

    def export_frame(self) -> dict:
        Xp = self.pca.transform(self.X).astype(np.float32)
        Xp *= self.cfg.pos_scale

        nodes = [
            {
                "id":        int(i),
                "group":     int(self.labels[i]),
                "influence": float(self._betweenness[i]),
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
        """Full per-step time-series log."""
        return self.run_log

    def export_event_log(self) -> list[dict]:
        """Full discrete event log."""
        return self.event_log