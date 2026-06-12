# Estaciona AI

> A resilient, multi-tiered edge-cloud architecture for intelligent parking management, coordinating real-time computer vision, predictive occupancy forecasting, and graph-based spatial routing over a photogrammetry-derived 3D digital twin.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## System Architecture

```
┌──────────────┐   WebSocket (SPOT_UPDATE)   ┌─────────────────┐
│   vision/    │ ──────────────────────────▶ │    gateway/     │
│  client.py   │   ws://edge:8001/ws/edge    │  (Python Edge)  │
│ YOLO + OpenCV│   Bearer: EDGE_API_KEY      │  Port 8001      │
└──────────────┘                             └────────┬────────┘
                                                      │ wss://api.estaciona.tech/ws/edge
                                             ┌────────▼────────┐
                                             │    server/      │
                                             │  Rust + Axum    │
                                             │  PostgreSQL     │
                                             │  Port 8000      │
                                             └──────┬──────────┘
                                                    │
                       ┌────────────────────────────┼────────────────────────────┐
                       │                            │                            │
               WS /ws/app                  WS /ws/dashboard                REST API
            ┌──────────────┐           ┌──────────────────┐        /reservations, /users
            │  web/app     │           │  web/dashboard   │        /reservations/recommend
            │  (user app)  │           │  (admin panel)   │
            └──────────────┘           └──────────────────┘

reconstruction/ ──RealityScan + DRACO──▶ .glb ──▶ web/assets/ (Three.js viewer)
infra/          ──Docker Compose + Caddy TLS──▶ api.estaciona.tech
```

---

## Repository Structure

| Module | Language | Description |
|--------|----------|-------------|
| [`server/`](./server/) | Rust | Core backend — Axum HTTP/WebSocket server, Dijkstra-based routing, PostgreSQL via SQLx |
| [`gateway/`](./gateway/) | Python | Edge gateway — store-and-forward reliability queue, ML inference, WebSocket bridge |
| [`vision/`](./vision/) | Python | Computer vision — YOLO instance segmentation, per-spot occupancy detection with debounce |
| [`reconstruction/`](./reconstruction/) | Python | 3D reconstruction — photogrammetry pipeline producing the parking lot digital twin |
| [`web/`](./web/) | HTML/CSS/JS | Frontend — user app, admin dashboard, Three.js 3D visualizer |
| [`infra/`](./infra/) | Docker | Infrastructure — Docker Compose, Caddy reverse proxy, PostgreSQL 15 |
| [`experiments/`](./experiments/) | Python | Metric extraction and analysis scripts |

---

## Key Components

### Edge Resilience
Detection events from vision nodes are persisted in a local SQLite queue at the gateway before forwarding. In the event of cloud unavailability, events are replayed transparently upon reconnection. SQLite operates in WAL mode with batch inserts, eliminating per-event fsync overhead during burst ingestion.

### Occupancy Forecasting
A `TemporalAttentionForecast` model (PyTorch, 4-head MultiheadAttention, 168-hour lookback) runs at the gateway edge, producing 24-hour occupancy forecasts every 5 minutes from historical PostgreSQL data. The model achieves R² = 0.950 and MAE = 1.69 spots on the testbed.

### Spot Recommendation
The `GET /reservations/recommend` endpoint applies a three-step priority chain at query time:
1. **Accessibility** — designated spots for PCD users (A-01, A-02) or seniors ≥ 60 years old (A-03, A-04) are unconditionally prioritized when the user profile qualifies and the spot is free.
2. **Personal history** — if the user has ≥ 3 recorded occupations, the most frequently used free spot from their history is returned.
3. **Shortest path** — Dijkstra over the `ParkingGraph` returns the minimum-cost reachable free spot.

### 3D Digital Twin
~1,000 drone photographs were processed through RealityScan to produce a dense photogrammetric mesh (~1.6 GB). The mesh was compressed with DRACO codec via Blender headless to ~30 MB, and served with gzip encoding for an effective transfer size of ~7 MB in the browser.

---

## Testbed

- **Facility:** Single-level surface parking lot, 44 spots
- **Deployment:** Edge node (video feed + gateway) + Azure cloud VM (Server + PostgreSQL)
- **Network:** LAN between edge camera and gateway; WAN (WebSocket over TLS) between gateway and cloud

---

## License

Copyright © 2026 Guilherme Pedroza. This project is licensed under the **GNU Affero General Public License v3.0**. See [`LICENSE`](./LICENSE) for details.
