# 3D Digital Twin Pipeline

> **Note:** This directory contains the initial experimental COLMAP/3DGS reconstruction pipeline and is no longer active. The final 3D model shipped in production was produced through a separate, higher-fidelity photogrammetry workflow described below.

---

## Production Reconstruction (Final)

The definitive `.glb` asset consumed by the web frontend was produced outside this directory using the following pipeline:

### 1. Capture
Approximately **1,000 aerial photographs** were captured by a DJI drone at multiple altitudes, angles, and passes, with high front/side overlap (≥ 80%) to ensure dense feature correspondences across the entire 44-spot parking lot surface.

### 2. Photogrammetry Reconstruction — RealityScan / RealityCapture
The image set was processed using **RealityScan** (Epic Games / Capturing Reality), a photogrammetry engine with significantly higher reconstruction fidelity than the COLMAP baseline explored in this directory. The raw output was a dense, texturized mesh at approximately **1.6 GB**.

### 3. Compression Stage 1 — DRACO (via Blender Headless)
The raw mesh was imported into **Blender** and exported in headless (CLI) mode with the **DRACO geometry compression** codec enabled, reducing the asset from 1.6 GB to approximately **30 MB** while preserving sufficient geometric detail for real-time rendering.

### 4. Compression Stage 2 — Gzip (runtime, frontend)
The 30 MB `.glb` is served with **gzip content encoding** at the HTTP layer. The Three.js `GLTFLoader` decompresses transparently on the client, resulting in an effective transfer size of approximately **7 MB** — viable for mobile delivery without streaming or progressive loading.

### Final Artifact

| Artifact | Size | Location |
|----------|------|----------|
| Raw RealityScan mesh | ~1.6 GB | Offline (not versioned) |
| Blender DRACO export | ~30 MB | `web/assets/` |
| Gzip transfer size | ~7 MB | Served by Caddy / Axum |
| Spot coordinate index | — | `web/data/spots_3d.json` |

---

## Archived Experimental Pipeline (This Directory)

The scripts and artifacts in this directory represent the initial reconstruction exploration conducted before adopting RealityScan. They are preserved for reference and reproducibility documentation.

### Experimental Structure

```
reconstruction/
├── src/
│   ├── main.py                  # CLI entry point — COLMAP pipeline orchestration
│   └── pipeline/
│       ├── reconstruction.py    # ReconstructionRunner — COLMAP sparse reconstruction wrapper
│       └── __init__.py
├── converter.py                 # Coordinate system conversion utilities
├── export_optimized.py          # GLB optimization and spot coordinate extraction
├── export_fix.py                # Post-processing for degenerate geometries
├── train.sh                     # 3D Gaussian Splatting training script
├── export.sh                    # 3DGS → mesh export script
├── setup_3dgs.sh                # Environment setup for 3DGS toolchain
├── experiments.md               # Lab notebook — reconstruction experiment log
├── photos_canon/                # Canon EOS calibration reference photographs
├── dji_1_LOD0.obj              # Raw drone mesh output from COLMAP (~1.5 GB, unversioned)
├── melhorresultado.blend        # Best COLMAP/3DGS reconstruction (Blender, ~592 MB)
└── melhorresultado_otimizado.glb  # Optimized COLMAP export, superseded by RealityScan output
```

### Experimental Approach

```
Aerial photographs (drone, Canon EOS, smartphone)
  → COLMAP SfM: feature extraction → matching → sparse reconstruction
  → 3D Gaussian Splatting (3DGS) training
  → Mesh extraction → Blender cleanup and LOD reduction
  → GLB export (experimental, superseded)
```

The COLMAP/3DGS approach was ultimately replaced due to reconstruction artifacts on large, low-texture surfaces (asphalt) and the superior output quality achievable with RealityScan at the same image count.

---

## Technology Stack

| Tool | Role |
|------|------|
| RealityScan / RealityCapture | Production photogrammetric reconstruction |
| Blender (headless) | DRACO compression and GLB export |
| COLMAP | Experimental SfM sparse reconstruction (archived) |
| `numpy` / `tqdm` | Point cloud processing and pipeline utilities |

---

## License

Copyright © 2026 Guilherme Pedroza. Licensed under the GNU Affero General Public License v3.0.
