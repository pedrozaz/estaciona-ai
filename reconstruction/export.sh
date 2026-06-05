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
