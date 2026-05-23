import subprocess
import sys
import os
from pathlib import Path


class ReconstructionRunner:
    def __init__(self, base_dir: Path, data_name: str):
        self.base_dir = base_dir.resolve()
        self.data_name = data_name
        
        # 3DGS Structure: input/ and sparse/0/
        self.photos_dir = self.base_dir / f"photos_{data_name}"
        self.output_dir = self.base_dir / "output"
        self.input_dir = self.output_dir / "input"
        self.sparse_dir = self.output_dir / "colmap" / "sparse" / "0"
        
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
        
        print(f"[COLMAP] Executing: {' '.join(cmd)}")
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as err:
            print(f"[ERROR] COLMAP failed: {err}")
            sys.exit(1)

    def prepare_gs_structure(self) -> None:
        """Creates the directory structure expected by most 3DGS implementations."""
        print(f"\n[0/3] Preparing 3DGS directory structure at {self.output_dir}...")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sparse_dir.mkdir(parents=True, exist_ok=True)
        
        # Create a symbolic link or copy images to 'input' folder
        if not self.input_dir.exists():
            print(f"Linking {self.photos_dir} to {self.input_dir}...")
            os.symlink(self.photos_dir, self.input_dir)

    def run_sparse_reconstruction(self) -> None:
        """Performs only the SfM steps needed for 3DGS with VRAM safety."""
        print(f"--- Starting SfM Pipeline for 3DGS ({self.data_name}) ---")
        
        if not self.photos_dir.exists() or not any(self.photos_dir.iterdir()):
            print(f"[ERROR] No photos found in {self.photos_dir}")
            sys.exit(1)
            
        self.prepare_gs_structure()
        db_path = self.output_dir / "database.db"

        # 1. Feature Extraction
        # VRAM Safety: 4000px is the sweet spot for 24MP sensors in SfM
        print("\n[1/3] Extracting features (SIFT GPU - Safe Mode)...")
        self._run_colmap([
            "feature_extractor",
            "--database_path", "/workspace/output/database.db",
            "--image_path", "/workspace/images",
            "--ImageReader.single_camera", "1",
            "--FeatureExtraction.use_gpu", "1",
            "--FeatureExtraction.max_image_size", "4000",
            "--SiftExtraction.max_num_features", "8192"
        ])

        # 2. Match
        print("\n[2/3] Sequential matching (GPU)...")
        self._run_colmap([
            "sequential_matcher",
            "--database_path", "/workspace/output/database.db",
            "--FeatureMatching.use_gpu", "1",
            "--SequentialMatching.overlap", "10"
        ])

        # 3. Sparse Mapping
        print("\n[3/3] Sparse Mapping (SfM)...")
        # Ensure output/sparse/0 exists for the mapper
        self.sparse_dir.mkdir(parents=True, exist_ok=True)
        self._run_colmap([
            "mapper",
            "--database_path", "/workspace/output/database.db",
            "--image_path", "/workspace/images",
            "--output_path", "/workspace/output/sparse"
        ])

        print(f"\n--- SfM RECONSTRUCTION COMPLETE ---")
        print(f"Dataset ready for 3DGS training at: {self.output_dir}")
