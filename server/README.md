# Rust Backend

> High-performance, asynchronous HTTP and WebSocket server powering the Estaciona AI platform. Implements Dijkstra-based spatial routing on a dynamic parking graph, PostgreSQL-backed reservation management, and an accessibility-aware five-tier spot recommendation policy.

---

## Overview

The server module is the central coordination layer of the Estaciona AI architecture. Built on [Axum](https://github.com/tokio-rs/axum) and [Tokio](https://tokio.rs/), it exposes a unified API surface for three classes of clients: edge gateway devices (via `/ws/edge`), end-user applications (via `/ws/app`), and administrative dashboards (via `/ws/dashboard`).

Spatial routing is implemented as a Dijkstra shortest-path search over a dynamic `ParkingGraph`, a weighted directed graph where nodes represent physical locations and edges encode traversal costs. The recommendation engine enforces a deterministic priority ordering: accessibility spaces → personal occupancy history → collective popularity → minimum-cost path.

---

## Module Structure

```
server/
├── src/
│   ├── main.rs          # Application bootstrap, route definitions, background expiry loop
│   ├── auth.rs          # JWT issuance and validation (jsonwebtoken + hmac/sha2)
│   ├── pathfinding.rs   # ParkingGraph, Dijkstra implementation, spot recommendation
│   ├── reservations.rs  # Reservation lifecycle (create, confirm, extend, cancel, expire)
│   ├── security.rs      # Argon2id password hashing, plate pepper hashing
│   ├── state.rs         # SharedState definition (database pool, broadcast channel, sessions)
│   ├── users.rs         # User registration and retrieval
│   └── ws/
│       ├── messages.rs  # ServerToAppMsg, ClientToServerMsg enums (serde)
│       ├── ws_edge.rs   # Edge device WebSocket handler (EDGE_API_KEY authentication)
│       └── ws.rs        # App and dashboard WebSocket handlers
├── .sqlx/               # Offline query metadata (sqlx prepare)
├── migrations/          # PostgreSQL schema migrations (sqlx migrate)
└── Cargo.toml
```

---

## Technology Stack

| Dependency | Version | Role |
|------------|---------|------|
| `axum` | 0.8.8 | HTTP framework, WebSocket upgrades |
| `tokio` | 1.50.0 | Asynchronous runtime |
| `sqlx` | 0.9.0 | Compile-time verified PostgreSQL queries |
| `serde` / `serde_json` | latest | JSON serialization |
| `argon2` | 0.5.3 | OWASP-recommended password hashing |
| `jsonwebtoken` | 10.4.0 | JWT authentication |
| `dashmap` | 6.1.0 | Lock-free concurrent session map |
| `tower-http` | 0.6.11 | CORS, static file serving, request tracing |
| `chrono` | 0.4.44 | Timezone-aware timestamps |
| `uuid` | 1.23.0 | v4 resource identifiers |

---

## API Reference

### WebSocket Endpoints

| Endpoint | Audience | Authentication |
|----------|----------|----------------|
| `GET /ws/edge` | Vision edge devices | `Authorization: Bearer <EDGE_API_KEY>` |
| `GET /ws/app` | Mobile / web user app | JWT cookie |
| `GET /ws/dashboard` | Admin dashboard | JWT cookie |

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `POST` | `/users` | Register new user |
| `GET` | `/users/{id}` | Retrieve user profile |
| `POST` | `/login` | Admin authentication (returns JWT) |
| `GET` | `/reservations/recommend` | Recommend optimal spot (pathfinding) |
| `POST` | `/reservations` | Create reservation |
| `GET` | `/reservations` | List active reservations |
| `PUT` | `/reservations/{id}/cancel` | Cancel reservation |
| `POST` | `/reservations/{id}/confirm` | Confirm physical occupancy |
| `PUT` | `/reservations/{id}/extend` | Extend reservation window |
| `PUT` | `/spots/{id}/status` | Update spot status (edge device) |
| `POST` | `/config` | Persist dashboard configuration |

### WebSocket Message Types

```jsonc
// Server → App (broadcast or unicast)
{ "type": "SpotUpdate", "spot_id": "A-05", "status": "occupied" }
{ "type": "ReservationExpired", "spot_id": "A-05" }
```

---

## Spot Recommendation Policy

The `/reservations/recommend` endpoint applies a strict priority chain:

1. **Accessibility** — spots designated for disabled and elderly individuals are unconditionally prioritized when the requesting user holds an accessibility credential.
2. **Personal history** — if the user has ≥ 3 prior occupations of a given spot, that spot is returned directly (preference routing).
3. **Shortest path** — Dijkstra over the `ParkingGraph` returns the minimum-cost reachable free spot from the user's current position.

---

## Background Tasks

A Tokio task runs every **10 seconds** to:
1. Query reservations whose `expires_at` timestamp has elapsed.
2. Transition their status to `expired` and release the associated spot.
3. Deliver a `ReservationExpired` push notification to the user's active WebSocket session via the `DashMap`-backed session registry.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | HMAC secret for JWT signing |
| `PLATE_SECRET_PEPPER` | Additional entropy for license plate hashing |
| `EDGE_API_KEY` | Shared secret for edge device authentication |

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.
