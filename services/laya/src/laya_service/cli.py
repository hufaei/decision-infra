from __future__ import annotations

import argparse
import os

import uvicorn

from .api import create_app
from .backend import UpstreamLayaBackend


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the pinned Laya Multilingual model")
    parser.add_argument("--host", default=os.getenv("LAYA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("LAYA_PORT", "8010")))
    parser.add_argument("--device", choices=("cpu", "cuda", "mps"), default="cpu")
    args = parser.parse_args()
    backend = UpstreamLayaBackend.load(device=args.device)
    uvicorn.run(create_app(backend), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
