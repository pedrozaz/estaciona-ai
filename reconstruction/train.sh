#!/bin/bash
# ==============================================================================
# Copyright (C) 2026 Guilherme Pedroza
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
# ==============================================================================
# train.sh — 3DGS training optimized for RTX 5060 Ti (16GB VRAM) + 16GB RAM
#
# Constraints solved:
#   RAM:  500 imgs × 1503×1002 × 3 (uint8) ≈ 2.25GB — fits easily in 16GB
#   VRAM: 16GB total, ~14GB available for Gaussians + rendering
#
# Quality focus:
#   - use-scale-regularization: prevents elongated spikes
#   - max-gauss-ratio 5.0: limits Gaussian stretch → cleaner surfaces
#   - cull-alpha-thresh 0.1: removes transparent ghost Gaussians
#   - stop-split-at 20000: lets densification run longer for fuller coverage
#   - camera-optimizer SO3xR3: refines COLMAP poses for tighter alignment

source .venv_3dgs/bin/activate
DATA_PATH="/mnt/data/projects/estaciona-ai/reconstruction/output"

echo "--- Starting 3DGS Training (factor 4 · 1503×1002 · memory-safe) ---"
echo "RAM budget:  ~2.25GB for images (of 16GB available)"
echo "VRAM budget: ~14GB for model (of 16GB available)"
echo ""

yes y | ns-train splatfacto \
  --experiment-name estaciona \
  --max-num-iterations 30000 \
  --pipeline.model.sh-degree 3 \
  --pipeline.model.num-downscales 0 \
  --pipeline.model.densify-grad-thresh 0.0004 \
  --pipeline.model.cull-alpha-thresh 0.1 \
  --pipeline.model.cull-scale-thresh 0.5 \
  --pipeline.model.use-scale-regularization True \
  --pipeline.model.max-gauss-ratio 5.0 \
  --pipeline.model.stop-split-at 20000 \
  --pipeline.model.rasterize-mode antialiased \
  --pipeline.model.enable-collider False \
  --pipeline.model.camera-optimizer.mode SO3xR3 \
  --pipeline.datamanager.cache-images cpu \
  --pipeline.datamanager.cache-images-type uint8 \
  --pipeline.datamanager.images-on-gpu False \
  --vis tensorboard \
  colmap \
  --data "$DATA_PATH" \
  --downscale-factor 4
