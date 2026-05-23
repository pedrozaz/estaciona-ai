import torch
import numpy
import sys
from pathlib import Path

# Patch torch.load to be insecure but work with current checkpoints
original_load = torch.load
def patched_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_load(*args, **kwargs)
torch.load = patched_load

from nerfstudio.scripts.exporter import entrypoint

if __name__ == "__main__":
    # Ensure the config path is relative to the project root
    # We expect arguments to be passed as they would be to ns-export
    entrypoint()
