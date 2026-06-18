# Edge Gateway

> Resilient WebSocket bridge between vision edge nodes and the cloud backend. Implements a store-and-forward reliability layer over local SQLite, a batch-optimized ingestion pipeline, and an embedded PyTorch Temporal Attention forecasting engine operating entirely at the network edge.

---

## Overview

The gateway module occupies the critical middle tier of the Estaciona AI architecture. It accepts WebSocket connections from one or more vision edge devices, enriches each detection event with ingestion timestamps, and forwards the payload to the cloud Rust server. In the event of cloud connectivity loss, events are durably persisted in a local SQLite fallback queue and transparently replayed upon reconnection, achieving a 100% message delivery guarantee over outages up to 124.16 seconds.

Beyond event routing, the gateway hosts an independent ML inference loop that queries the cloud PostgreSQL database for occupancy history and publishes 24-hour occupancy forecasts via the same WebSocket channel every 5 minutes.

---

## Module Structure

```
gateway/
├── gateway.py           # Main process — asyncio event loop, WebSocket handlers, sync loop
├── ml/
│   ├── inference.py     # PredictiveEngine — TemporalAttentionForecast model
│   └── models/
│       └── occupancy_transformer.pt  # Serialized PyTorch checkpoint
├── pyproject.toml
└── uv.lock
```

---

## Technology Stack

| Dependency | Role |
|------------|------|
| `websockets` | Async WebSocket server and client |
| `asyncio` | Cooperative multitasking runtime |
| `sqlite3` | Local fallback and metrics persistence (stdlib) |
| `torch` | PyTorch — ML model inference |
| `pandas` / `numpy` | Time-series aggregation for occupancy history |
| `sqlalchemy` | PostgreSQL access for ML history queries |
| `scikit-learn` | Model evaluation metrics (R², MAE, RMSE) |
| `python-dotenv` | Environment variable management |

---

## Reliability Design

### Store-and-Forward Queue

All incoming detection events are immediately persisted to a local SQLite database (`local_fallback.db`) before any forwarding is attempted. The `sync_loop` coroutine independently drains this queue toward the cloud, marking each event as `synced` only upon successful delivery. This decoupled architecture ensures that transient network partitions are invisible to the upstream vision pipeline.

### Batch Insertion (WAL Optimization)

The SQLite databases operate in **WAL (Write-Ahead Log)** mode with `synchronous=NORMAL`, eliminating per-write `fsync` overhead. The ingestion handler accumulates burst messages using a 10ms drain window (`asyncio.wait_for`) and commits them via `executemany`, reducing per-event I/O from O(N) individual transactions to O(1) batch commits. The sync loop similarly batches metric updates via `executemany`.

### Local Metrics Database

A secondary SQLite database (`metrics.db`) records per-event latency observations:

| Column | Description |
|--------|-------------|
| `edge_id` | Originating camera identifier |
| `spot_id` | Parking spot identifier |
| `detection_ts` | Timestamp of detection at the vision node |
| `edge_sent_ts` | Timestamp of WebSocket send at the edge |
| `gateway_received_ts` | Timestamp of ingestion at the gateway |
| `gateway_forwarded_ts` | Timestamp of forward to cloud |
| `cloud_ack` | Boolean — successfully delivered to cloud |

---

## ML Inference Engine

### Model Architecture

`TemporalAttentionForecast` is a compact Transformer encoder implemented in PyTorch:

```
Input: 168 hourly occupancy counts (7-day lookback window)
  → Linear projection: R¹ → R³²
  → MultiheadAttention: 4 heads, embed_dim=32
  → Flatten + MLP: [32×168 → 128 → 24]
Output: 24 predicted hourly occupancy counts
```

### Inference Loop

Every **5 minutes**, `PredictiveEngine.predict_trends()`:
1. Queries `user_occupancy_history` from PostgreSQL for the past 192 hours.
2. Uses the last 168 hours as input to forecast the next 24 hours.
3. Evaluates model health by predicting the known last 24 hours from the prior 168-hour window, computing R², MAE, and RMSE.
4. Publishes a `TREND_PREDICTION` payload to the cloud WebSocket.

### Reported Performance

| Metric | Value |
|--------|-------|
| R² score | 0.950 |
| MAE | 1.69 spots |
| Inference time | < 5 ms (CPU) |
| Update frequency | Every 5 minutes |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SERVER_WS_URL` | Cloud WebSocket URL (`wss://{api_url}/ws/edge`) |
| `GATEWAY_PORT` | Local listening port (default: `8001`) |
| `EDGE_API_KEY` | Shared secret for cloud authentication |
| `ML_DATABASE_URL` | PostgreSQL URL for occupancy history queries |

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.
