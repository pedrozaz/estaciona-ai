# Computer Vision Edge Node

> Real-time parking spot occupancy detection via instance segmentation. Runs a YOLO vehicle detector against a live video stream, computes per-spot mask overlap with configurable debounce hysteresis, and publishes binary occupancy state changes to the edge gateway over WebSocket.

---

## Overview

The vision module implements the perception layer of the Estaciona AI pipeline. A YOLO instance segmentation model processes video frames to produce per-vehicle segmentation masks. Each frame's mask set is intersected against a static map of parking spot polygons (`spots.json`), yielding a continuous occupancy confidence score per spot. A dual-threshold debounce filter — with independent trigger and release delays — translates the noisy signal into stable boolean state transitions that are then transmitted to the gateway.

The module is designed to operate as a self-contained edge process on a camera-adjacent node (e.g., NVIDIA Jetson, desktop GPU), requiring only network reachability to the gateway.

---

## Module Structure

```
vision/
├── src/
│   ├── client.py        # Main process — detection loop, debounce, WebSocket publisher
│   └── calibrate.py     # Camera calibration utility
├── data/
│   └── spots.json       # Static polygon definitions for all 44 parking spots
├── sync_mappings.py     # Spot ID normalization between detector and server schemas
├── yolo26x-seg.pt       # Default model checkpoint (YOLO v26 segmentation, 142 MB)
└── pyproject.toml
```

---

## Technology Stack

| Dependency | Role |
|------------|------|
| `ultralytics` | YOLO model loading, inference, and segmentation mask decoding |
| `opencv-python` | Video capture, frame preprocessing (gamma correction, CLAHE) |
| `torch` | GPU tensor operations, half-precision inference |
| `websockets` | Async WebSocket publisher to the gateway |
| `python-dotenv` | Environment variable management |

---

## Detection Pipeline

```
VideoCapture frame
  → Gamma correction (γ = 1.4) + optional CLAHE
  → YOLO inference (classes: [2=car, 7=truck], conf=0.10, imgsz=1312)
  → Bounding box shrink (BOX_SHRINK_FACTOR = 0.85)
  → Per-spot mask overlap: IoU(spot_polygon, vehicle_mask)
  → Debounce filter (see below)
  → WebSocket publish (on state change only)
```

### Debounce Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Occupied trigger threshold | 35% overlap | Minimum IoU to increment occupied counter |
| Occupied trigger frames | 2 consecutive | Frames required before transition to occupied |
| Occupied trigger delay | 0.5 s | Minimum time before state change is emitted |
| Occupied stay threshold | 20% overlap | Hysteresis threshold — below this, free counter begins |
| Free trigger frames | 5 consecutive | Frames required before transition to free |
| Free trigger delay | 3.0 s | Minimum time before free state is emitted |

The asymmetric thresholds (lower to enter occupied, higher free delay) are designed to minimize false free events caused by momentary occlusion during vehicle entry/exit maneuvers.

---

## WebSocket Message Format

State changes are published as JSON to `ws://<gateway>:<port>/ws/edge`:

```json
{
  "type": "SPOT_UPDATE",
  "spot_id": "A-05",
  "status": "occupied",
  "camera_id": "cam_01",
  "confidence": 0.72,
  "timestamp": "2026-06-12T00:26:19.000Z",
  "edge_sent_at": "2026-06-12T00:26:19.050Z"
}
```

Authentication uses a Bearer token (`EDGE_API_KEY`) passed in the WebSocket upgrade headers. The client implements automatic exponential-backoff reconnection via `safe_send()`.

---

## Spot Definition Format (`data/spots.json`)

Each entry defines a named parking spot as a list of pixel-coordinate vertices forming a convex polygon in the camera's image plane:

```json
{
  "A-05": [[120, 340], [180, 340], [180, 420], [120, 420]]
}
```

Polygon coordinates are camera-specific and must be recalibrated when the camera position changes.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GATEWAY_WS_URL` | Gateway WebSocket URL (e.g., `ws://localhost:8001/ws/edge`) |
| `EDGE_API_KEY` | Shared secret for gateway authentication |
| `VIDEO_SOURCE` | OpenCV video capture source (path, RTSP URL, or device index) |

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.
