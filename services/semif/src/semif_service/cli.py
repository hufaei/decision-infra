from __future__ import annotations

import argparse
import os

import uvicorn

from .api import create_app
from .backend import UpstreamSemIfBackend

DEFAULT_MODEL = "Qwen/Qwen3.5-4B"
DEFAULT_MODEL_REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the choice-only SemIf adapter")
    parser.add_argument("--host", default=os.getenv("SEMIF_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("SEMIF_PORT", "8009")))
    parser.add_argument("--device", choices=("auto", "cuda", "mps"), default="auto")
    parser.add_argument(
        "--dtype",
        choices=("bfloat16", "float16", "float32"),
        default="bfloat16",
    )
    parser.add_argument("--max-tokens", type=int, default=4096)
    args = parser.parse_args()
    backend = UpstreamSemIfBackend.load(
        DEFAULT_MODEL,
        DEFAULT_MODEL_REVISION,
        device=args.device,
        dtype=args.dtype,
        max_tokens=args.max_tokens,
    )
    uvicorn.run(create_app(backend), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
