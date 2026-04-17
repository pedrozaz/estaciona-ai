import os
import subprocess
import sys
from pathlib import Path


class ColmapRunner:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir

        self.photos_dir = base_dir / "photos"
        self.output_dir = base_dir / "colmap_output"
        self.sparse_dir = self.output_dir / "sparse"
        self.dense_dir = self.output_dir / "dense"

        self.rel_photos = "photos"
        self.rel_db = "colmap_output/database.db"
        self.rel_sparse = "colmap_output/sparse"
        self.rel_dense = "colmap_output/dense"

    def _run_command(self, colmap_args: list[str]) -> None:
        uid = os.getuid()
        gid = os.getgid()

        colmap_cmd = " ".join(["colmap"] + colmap_args)

        # Executa como root (sem a flag -u) para o xvfb ter acesso ao /tmp,
        # e depois corrige as permissões dos arquivos gerados.
        shell_script = (
            f"xvfb-run -a {colmap_cmd} && chown -R {uid}:{gid} /workspace/colmap_output"
        )

        docker_cmd = [
            "docker",
            "run",
            "--rm",
            "--device",
            "nvidia.com/gpu=all",
            "-e",
            "QT_QPA_PLATFORM=offscreen",
            "-v",
            f"{self.base_dir}:/workspace",
            "-w",
            "/workspace",
            "colmap-gpu",
            "bash",
            "-c",
            shell_script,
        ]

        print(f"[DOCKER] Executing: {colmap_cmd}")
        try:
            subprocess.run(docker_cmd, check=True)
        except subprocess.CalledProcessError as err:
            print(f"[ERROR] Command failed: {err}", file=sys.stderr)
            sys.exit(1)

    def setup_directories(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.sparse_dir.mkdir(parents=True, exist_ok=True)
        self.dense_dir.mkdir(parents=True, exist_ok=True)

        if not self.photos_dir.exists() or not any(self.photos_dir.iterdir()):
            print("[ERROR] 'photos' directory is empty or missing.", file=sys.stderr)
            sys.exit(1)

    def extract_features(self) -> None:
        self._run_command(
            [
                "feature_extractor",
                "--database_path",
                self.rel_db,
                "--image_path",
                self.rel_photos,
                "--ImageReader.single_camera",
                "1",
                "--FeatureExtraction.use_gpu",
                "1",
            ]
        )

    def match_features(self) -> None:
        self._run_command(
            [
                "exhaustive_matcher",
                "--database_path",
                self.rel_db,
                "--FeatureMatching.use_gpu",
                "1",
            ]
        )

    def build_sparse_model(self) -> None:
        self._run_command(
            [
                "mapper",
                "--database_path",
                self.rel_db,
                "--image_path",
                self.rel_photos,
                "--output_path",
                self.rel_sparse,
            ]
        )

    def undistort_images(self) -> None:
        self._run_command(
            [
                "image_undistorter",
                "--image_path",
                self.rel_photos,
                "--input_path",
                f"{self.rel_sparse}/0",
                "--output_path",
                self.rel_dense,
                "--output_type",
                "COLMAP",
            ]
        )
