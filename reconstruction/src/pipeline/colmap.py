import subprocess
import sys
from pathlib import Path


class ColmapRunner:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.photos_dir = base_dir / "photos"
        self.output_dir = base_dir / "colmap_output"
        self.db_path = self.output_dir / "database.db"
        self.sparse_dir = self.output_dir / "sparse"
        self.dense_dir = self.output_dir / "dense"

    def _run_command(self, command: list[str]) -> None:
        print(f"[COLMAP] Executing: {' '.join(command)}")
        try:
            subprocess.run(command, check=True)
        except subprocess.CalledProcessError as err:
            print(f"[COLMAP] Command failed: {err}", file=sys.stderr)
            sys.exit(1)

    def setup_directories(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sparse_dir.mkdir(parents=True, exist_ok=True)
        self.dense_dir.mkdir(parents=True, exist_ok=True)

        if not self.photos_dir.exists() or not any(self.photos_dir.iterdir()):
            print(
                f"[COLMAP] Error: Photos directory '{self.photos_dir}' is empty or does not exist.",
                file=sys.stderr,
            )
            sys.exit(1)

    def extract_features(self) -> None:
        self._run_command(
            [
                "colmap",
                "feature_extractor",
                "--database_path",
                str(self.db_path),
                "--image_path",
                str(self.photos_dir),
                "--ImageReader.single_camera",
                "1",
            ]
        )

    def match_features(self) -> None:
        self._run_command(
            ["colmap", "exhaustive_matcher", "--database_path", str(self.db_path)]
        )

    def build_sparse_model(self) -> None:
        self._run_command(
            [
                "colmap",
                "mapper",
                "--database_path",
                str(self.db_path),
                "--image_path",
                str(self.photos_dir),
                "--output_path",
                str(self.sparse_dir),
            ]
        )

    def undistort_images(self) -> None:
        self._run_command(
            [
                "colmap",
                "image_undistorter",
                "--image_path",
                str(self.photos_dir),
                "--input_path",
                str(self.sparse_dir / "0"),
                "--output_path",
                str(self.dense_dir),
                "--output_type",
                "COLMAP",
            ]
        )
