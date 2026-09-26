# Frontend

> Vanilla HTML/CSS/JavaScript frontend providing a real-time parking occupancy dashboard, a Three.js-powered 3D digital twin visualizer, user reservation management, and an administrative control panel.

---

## Overview

The web module contains four static pages published through GitHub Pages at `estaciona.tech`. REST and WebSocket traffic goes to the separate API at `api.estaciona.tech`. The Rust server can also serve the same files locally.

The user-facing application (`app.html`) presents a live-updated 3D visualization of the parking lot using a photogrammetry-derived `.glb` model, overlaid with real-time occupancy state and reservation controls. The dashboard (`dashboard.html`) provides operators with system-wide metrics, live spot status, and configuration management. Both interfaces maintain persistent WebSocket connections to receive server-pushed state updates without polling.

---

## Interface Descriptions

### `app.html` — User Application (~73 KB)
The primary interface for end users. Features include:
- **3D parking lot visualizer** — Three.js renderer consuming the `spots_3d.json` spatial index and the photogrammetry-derived `.glb` model. Spot meshes are dynamically colored to reflect real-time occupancy state received via WebSocket.
- **Spot reservation** — Integrates with the `/reservations` REST API to create, extend, and cancel reservations.
- **Pathfinding recommendation** — Calls `/reservations/recommend` and highlights the suggested spot in the 3D view.
- **Push notifications** — Handles `ReservationExpired` and `SpotUpdate` server messages.

### `dashboard.html` — Administrative Dashboard (~21 KB)
Operator-facing panel providing:
- Live spot status grid with real-time WebSocket updates via `/ws/dashboard`.
- 24-hour occupancy forecast visualization from the gateway ML engine (`TREND_PREDICTION` messages).
- System configuration management (persisted via `POST /config`).

### `login.html` — Admin Authentication (~17 KB)
Credential form for dashboard access. Submits to `POST /login` and stores the returned JWT for subsequent authenticated requests.

### `index.html` — Landing Page (~5.7 KB)
Public-facing product presentation page.

---

## Architecture

```
web/
├── app.html             # User mobile/web application
├── dashboard.html       # Administrative panel
├── login.html           # Admin authentication
├── index.html           # Public landing page
├── css/                 # Base styles and the shared Uniube-inspired experience layer
├── js/                  # Application logic and lightweight landing motion
├── lib/                 # Vendored libraries (Three.js + addons)
├── assets/              # Static assets (icons, images, .glb model)
├── locales/             # i18n string tables
└── data/
    ├── config.json      # Runtime configuration (written by POST /config)
    └── spots_3d.json    # 3D spot coordinate index (output of reconstruction pipeline)
```

---

## Communication Protocol

All dynamic data flows over WebSocket or REST:

| Interface | WebSocket Endpoint | REST Endpoints Used |
|-----------|--------------------|---------------------|
| `app.html` | `GET /ws/dashboard` | `/reservations`, `/reservations/recommend` |
| `dashboard.html` | `GET /ws/dashboard` | `POST /config` |
| `login.html` | — | `POST /login` |

WebSocket messages received from the server follow the `ServerToAppMsg` schema defined in `server/src/ws/messages.rs`.

---

## Technology Stack

| Technology | Role |
|------------|------|
| Vanilla HTML/CSS/JS | Application structure, styling, logic — zero build tooling |
| [Three.js](https://threejs.org/) | WebGL 3D renderer for the parking lot digital twin |
| GLTFLoader | Loads the photogrammetry `.glb` model |

No bundler, transpiler, or package manager is involved. Three.js and its addons are vendored under `lib/`; the interface uses the system font stack and does not require a font CDN. The landing page uses a procedural Three.js campus illustration and a native-scroll reveal script. Landing, login, and dashboard reuse `js/campus-scene.js`, with a 1.5 device-pixel-ratio cap, frame-rate-independent motion, offscreen/hidden-tab suspension, reduced-motion support, and an HTML/SVG fallback. The hero illustration is explicitly conceptual; the lower section shows the real campus orthomosaic. The 3D views reuse the existing photogrammetric models. Page links and static asset paths are relative to the HTML document so they work on the root custom domain and in a GitHub Pages project preview path. API and WebSocket endpoints remain separate.

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.

## Visual and editorial conventions

The interface uses a navy tonal scale (`#0c1c36`, `#142944`, `#203952`), warm off-white for text, and a restrained amber action color (`#e3b584`). Occupancy colors remain semantic. Typography uses local system fonts, with Georgia for the landing's editorial accent. No additional font or Three.js CDN is required.

Landing copy is based on the project documentation and the [research paper](https://github.com/pedrozaz/estaciona-ai-paper): distinguish controlled prototype evaluation from field deployment, and synthetic forecast evaluation from real-world validation. Do not promote research metrics as production guarantees.
