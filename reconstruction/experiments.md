# 3D Reconstruction Experiments & Iterations Log

This document serves as a detailed record of the research and development process for the Estaciona AI reconstruction pipeline. It tracks technical challenges, attempted solutions, and the rationale behind strategic pivots.

---

## Experiment 1: Standard COLMAP Dense Pipeline
**Date:** Initial Stage  
**Method:** COLMAP MVS (Multi-View Stereo) -> Stereo Fusion -> Poisson Mesher  
**Infrastructure:** Dockerized COLMAP Environment

### Technical Setup:
- **Depth Map Generation:** `patch_match_stereo` with high-quality settings.
- **Fusion:** `stereo_fusion` for point cloud unification.
- **Meshing:** `poisson_mesher` for surface generation.

### Findings & Challenges:
- **Memory Consumption (OOM):** The Canon high-resolution dataset (6000x4000) consistently triggered Out-Of-Memory (OOM) errors during the `stereo_fusion` phase, even with limited threads.
- **Performance:** Extremely slow processing times for large datasets.
- **Surface Quality:** The resulting mesh often contained significant artifacts in complex areas like asphalt and vegetation due to depth estimation inconsistencies.

---

## Experiment 2: Custom Open3D Fusion Pipeline (TSDF)
**Date:** Recent Iteration  
**Method:** COLMAP SfM -> Custom Python Reader -> Open3D TSDF Integration  
**Infrastructure:** Python 3.12, Open3D 0.18.0

### Technical Setup:
- **Hybrid Approach:** Used COLMAP only for SfM and Depth Map generation.
- **Custom Reader:** Developed a robust binary reader for COLMAP `.bin` depth maps, featuring:
    - **Header Detection:** Handling variant headers (text-based string headers with `&` separators vs. standard 64-bit binary headers).
    - **Dynamic Resizing:** On-the-fly resizing of color images to match depth map dimensions using OpenCV `INTER_AREA`.
- **Fusion Algorithm:** `ScalableTSDFVolume` with a 3cm-5cm voxel size.
- **Post-Processing:** Statistical Outlier Removal and Laplacian Smoothing.

### Findings & Challenges:
- **Alignment Issues:** Initial attempts failed due to a 1-byte alignment error in reading depth maps, leading to corrupted geometries.
- **Visual Artifacts ("Floaters"):** Despite TSDF integration, the high-res Canon photos produced significant "dust-like" noise around the main structures.
- **Surface Integrity:** Attempts to increase `voxel_size` to fill holes led to loss of fine detail. Attempts to keep detail resulted in a fragmented, "mediocre" quality mesh.
- **Memory Requirements:** While more stable than COLMAP's fusion, it still required aggressive swap usage (15GB) to process the high-res buffers.

### Metrics (Last Run):
- **Vertices:** 3,328,540
- **Triangles:** 4,594,425
- **Processing Speed:** ~1.5 - 2.0 frames/sec integration.

---

## Pivot Decision: Transition to 3D Gaussian Splatting (3DGS)
**Status:** Active Research Phase  
**Rationale:** The transition from rigid geometry (meshes) to learned radiance fields.

### Why 3DGS?
1. **Visual Fidelity:** 3DGS handles complex lighting, reflections, and thin structures (leaves, power lines) far better than traditional meshing.
2. **Surface Continuity:** Solves the "hole" problem in asphalt and flat surfaces by learning the radiance field instead of interpolating a shell.
3. **Performance:** Offers real-time navigation in the reconstructed scene with fotorrealistic quality.

### Strategy Change:
- **Pipeline Simplification:** Deprecating the dense MVS and meshing scripts.
- **SfM Optimization:** Focusing the COLMAP stage exclusively on producing high-precision camera poses and an initial sparse point cloud.
- **Host Execution:** Moving training to the bare-metal host environment to maximize GPU utilization (NVIDIA CUDA) and avoid Docker overhead during intensive SGD (Stochastic Gradient Descent) training.

---

## Lessons Learned & Best Practices
- **Data Pre-processing:** Consistent lighting/WB via Darktable is non-negotiable for high-fidelity reconstruction.
- **File Format Nuances:** COLMAP binary formats vary across versions; robust header detection (as implemented in `fusion.py`) is critical for pipeline stability.
- **Hardware Limitations:** High-resolution photogrammetry is inherently RAM-intensive; proactive Virtual Memory management (Swap) is a requirement for commodity hardware.
- **Technology Alignment:** For large-scale urban environments (campuses/parking lots), TSDF/Poisson meshing is often insufficient compared to modern volumetric approaches like 3DGS or NeRFs.
