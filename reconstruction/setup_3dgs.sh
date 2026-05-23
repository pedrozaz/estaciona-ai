#!/bin/bash
# setup_3dgs.sh - Environment preparation for 3DGS on RTX 50-series

set -e

echo "--- Preparing 3DGS Environment for Blackwell (RTX 50-series) ---"

# 1. Create a dedicated virtual environment using uv (faster) or conda
# We'll use uv to create a clean environment
uv venv .venv_3dgs --python 3.11
source .venv_3dgs/bin/activate

# 2. Install PyTorch Nightly (required for Blackwell sm_120 support in many libs)
echo "Installing PyTorch Nightly with CUDA 12.x support..."
uv pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128

# 3. Install gsplat (The core engine for modern 3DGS)
# We force version 1.5.0+ for RTX 50 compatibility
echo "Installing gsplat with Blackwell support..."
uv pip install "gsplat>=1.5.0"

# 4. Install Nerfstudio (The most stable pipeline for training)
echo "Installing Nerfstudio..."
uv pip install nerfstudio

# 5. Verify GPU access and Compute Capability
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}'); print(f'Compute Capability: {torch.cuda.get_device_capability(0)}')"

echo "--- Setup Complete! ---"
echo "To start training, run: source .venv_3dgs/bin/activate"
