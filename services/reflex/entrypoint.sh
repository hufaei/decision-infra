#!/bin/sh
set -eu

model_path="$(uv run --no-sync python -c '
import sys
from huggingface_hub import snapshot_download
print(snapshot_download(sys.argv[1], revision=sys.argv[2]))
' Qwen/Qwen3.5-4B 851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a)"

set -- --model "$model_path" --permutations 2 --served-name reflex-qwen3.5-4b --host 0.0.0.0 --port "$PORT"
exec uv run --no-sync reflex-serve "$@"
