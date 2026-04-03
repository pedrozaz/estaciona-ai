import argparse
from pathlib import Path
from pipeline.colmap import ColmapRunner


def main() -> None:
    parser = argparse.ArgumentParser(
        description="3D Reconstruction Pipeline for  Estaciona AI"
    )
    parser.add_argument(
        "--step",
        type=str,
        choices=["all", "colmap", "blender"],
        default="all",
        help="Pipeline step to execute",
    )
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent

    if args.step in ["all", "colmap"]:
        print("--- Starting COLMAP Pipeline ---")
        runner = ColmapRunner(base_dir)
        runner.setup_directories()
        runner.extract_features()
        runner.match_features()
        runner.build_sparse_model()
        runner.undistort_images()
        print("--- COLMAP Pipeline Completed ---\n")

    if args.step in ["all", "blender"]:
        print("--- Starting Blender Pipeline ---")
        print("Blender pipeline is not implemented yet.")


if __name__ == "__main__":
    main()
