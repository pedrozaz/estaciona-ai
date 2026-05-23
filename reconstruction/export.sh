#!/bin/bash
# export.sh - Export the trained Splatfacto model to PLY

source .venv_3dgs/bin/activate

echo "--- Exporting 3DGS Model to PLY ---"

# Ensure exports directory exists
mkdir -p exports

# Find the latest config.yml
LATEST_CONFIG=$(find outputs/estaciona/splatfacto -name "config.yml" | sort -r | head -n 1)

if [ -z "$LATEST_CONFIG" ]; then
    echo "[ERROR] No training configuration found. Run train.sh first."
    exit 1
fi

echo "Using config: $LATEST_CONFIG"

# Using the export fix script
python export_fix.py gaussian-splat \
    --load-config "$LATEST_CONFIG" \
    --output-dir exports/

echo "Export complete: exports/splat.ply"
