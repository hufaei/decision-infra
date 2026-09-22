from __future__ import annotations

import os
import subprocess
from pathlib import Path


def test_entrypoint_uses_the_pinned_snapshot_and_stable_permutation_count(
    tmp_path: Path,
) -> None:
    fake_uv = tmp_path / "uv"
    fake_uv.write_text(
        "#!/bin/sh\n"
        'if [ "$3" = python ]; then\n'
        '  printf "%s\\n" "$*" >&2\n'
        "  echo /cache/pinned-model\n"
        "else\n"
        '  printf "%s\\n" "$*"\n'
        "fi\n"
    )
    fake_uv.chmod(0o755)
    script = Path(__file__).parents[1] / "entrypoint.sh"
    environment = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "PORT": "8000",
    }

    result = subprocess.run(
        ["sh", script],
        check=True,
        capture_output=True,
        text=True,
        env=environment,
    )

    assert result.stdout.strip() == (
        "run --no-sync reflex-serve --model /cache/pinned-model "
        "--permutations 2 --served-name reflex-qwen3.5-4b "
        "--host 0.0.0.0 --port 8000"
    )
    assert "Qwen/Qwen3.5-4B" in result.stderr
    assert "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a" in result.stderr
