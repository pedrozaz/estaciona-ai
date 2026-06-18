# Infrastructure

> Docker Compose orchestration for the cloud-hosted Estaciona AI backend, comprising a PostgreSQL 15 database, the Rust/Axum application server, and a Caddy reverse proxy providing automatic TLS termination.

---

## Overview

The infra module defines the production deployment topology for the cloud tier of the Estaciona AI architecture. All three services run as Docker containers on a shared bridge network, with persistent volumes for database storage and TLS certificate management. The Rust server is built using a multi-stage Docker image to minimize the final runtime footprint.

This configuration is designed for deployment on a single cloud VM (Azure, tested) with public HTTPS exposure at `api.estaciona.tech`.

---

## Services

```
infra/
├── docker-compose.yml    # Service definitions and network topology
├── Dockerfile.server     # Multi-stage Rust build → slim Debian runtime
└── Caddyfile            # Reverse proxy and automatic TLS configuration
```

### Service Topology

| Service | Base Image | Exposed Port | Description |
|---------|------------|--------------|-------------|
| `db` | `postgres:15-alpine` | 5432 (internal) | Primary PostgreSQL database |
| `server` | `Dockerfile.server` | 8000 (internal) | Rust/Axum application server |
| `caddy` | `caddy:2-alpine` | 80, 443 (public) | Reverse proxy with automatic TLS |

All services communicate over the `estaciona_ai` bridge network. Only Caddy exposes ports to the host.

---

## Build Process

### `Dockerfile.server` — Multi-Stage Build

```
Stage 1 — Builder (rust:1.95.0-slim):
  - Copies source tree
  - Sets SQLX_OFFLINE=true (uses pre-generated .sqlx/ query cache)
  - Runs cargo build --release
  - Output: /app/target/release/estaciona-ai-rust-server

Stage 2 — Runtime (debian:bookworm-slim):
  - Installs: ca-certificates, libssl3, libpq5
  - Copies binary from builder stage
  - Copies spots_3d.json to /web/data/
  - ENTRYPOINT: ./estaciona-ai-rust-server
```

The multi-stage build keeps the final image minimal by excluding the Rust toolchain and build artifacts from the runtime layer.

---

## Reverse Proxy

`Caddyfile` configures a single virtual host:

```
api.estaciona.tech {
    reverse_proxy server:8000
}
```

Caddy automatically provisions and renews TLS certificates via Let's Encrypt (ACME) on first startup, requiring no manual certificate management.

---

## Volumes

| Volume | Mount | Description |
|--------|-------|-------------|
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL data directory |
| `caddy_data` | `/data` | TLS certificates and ACME account data |
| `caddy_config` | `/config` | Caddy runtime configuration |
| `../web` | `/web` | Static frontend files served by the Rust backend |

---

## Environment Variables

Production secrets are injected at runtime via a `.env` file co-located with `docker-compose.yml`. See `.env.example` in the repository root for the required variable reference.

| Variable | Consumer | Description |
|----------|----------|-------------|
| `POSTGRES_USER` | `db` | PostgreSQL superuser username |
| `POSTGRES_PASSWORD` | `db` | PostgreSQL superuser password |
| `POSTGRES_DB` | `db` | Database name |
| `DATABASE_URL` | `server` | Full connection string for SQLx |
| `JWT_SECRET` | `server` | HMAC secret for JWT signing |
| `PLATE_SECRET_PEPPER` | `server` | Additional entropy for license plate hashing |
| `EDGE_API_KEY` | `server` | Shared secret for edge device authentication |

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.
