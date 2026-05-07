import subprocess
import sys
import os
from pathlib import Path


class ReconstructionRunner:
    def __init__(self, base_dir: Path, data_name: str):
        self.base_dir = base_dir.resolve()
        self.data_name = data_name
        self.photos_dir = self.base_dir / f"photos_{data_name}"
        self.output_dir = self.base_dir / "output"
        self.docker_image = "colmap/colmap:latest"

    def _run_colmap(self, args: list[str]) -> None:
        cmd = [
            "docker", "run", "--rm", "--net=host", "--gpus", "all",
            "-v", f"{self.output_dir}:/workspace/output",
            "-v", f"{self.photos_dir}:/workspace/images:ro",
            "-u", f"{os.getuid()}:{os.getgid()}",
            self.docker_image,
            "colmap"
        ] + args
        
        print(f"[COLMAP] Executando: {' '.join(cmd)}")
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as err:
            print(f"[ERROR] COLMAP failed: {err}")
            sys.exit(1)

    def run_sparse_reconstruction(self) -> None:
        """Executa apenas a reconstrução esparsa necessária para o 3DGS."""
        print(f"--- Iniciando Reconstrução Esparsa para 3DGS ({self.data_name}) ---")
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        sparse_path = self.output_dir / "sparse"
        sparse_path.mkdir(exist_ok=True)

        # 1. Feature Extraction
        print("\n[1/3] Extraindo características...")
        self._run_colmap([
            "feature_extractor",
            "--database_path", "/workspace/output/database.db",
            "--image_path", "/workspace/images",
            "--ImageReader.single_camera", "1"
        ])

        # 2. Match
        print("\n[2/3] Fazendo correspondência (Exaustiva)...")
        self._run_colmap([
            "exhaustive_matcher",
            "--database_path", "/workspace/output/database.db"
        ])

        # 3. Sparse Mapping
        print("\n[3/3] Mapeamento esparso (Sparse Mapping)...")
        self._run_colmap([
            "mapper",
            "--database_path", "/workspace/output/database.db",
            "--image_path", "/workspace/images",
            "--output_path", "/workspace/output/sparse"
        ])

        print(f"\n--- RECONSTRUÇÃO ESPARSA CONCLUÍDA ---")
        print(f"Os dados para o 3DGS estão em: {self.output_dir}")
