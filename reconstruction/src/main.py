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
