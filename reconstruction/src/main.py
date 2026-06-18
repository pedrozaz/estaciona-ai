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

import argparse

from pathlib import Path
from pipeline.reconstruction import ReconstructionRunner


def main() -> None:
    parser = argparse.ArgumentParser(
        description="3D Reconstruction Pipeline for Estaciona AI"
    )
    parser.add_argument(
        "--data",
        choices=["celular", "canon", "drone"],
        required=True,
        help="Type of data to process",
    )

    args = parser.parse_args()
    base_dir = Path(__file__).parent.parent.resolve()

    print(f"--- Starting Reconstruction for {args.data.upper()} ---")
    runner = ReconstructionRunner(base_dir, args.data)
    
    print(f"[INFO] Output directory: {runner.output_dir}")
    
    # Executa apenas a parte esparsa necessária para o 3DGS
    runner.run_sparse_reconstruction()


if __name__ == "__main__":
    main()
