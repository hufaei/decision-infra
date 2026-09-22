from __future__ import annotations

import pytest

from semif_service.backend import BackendInputError, UpstreamSemIfBackend


def test_upstream_value_error_becomes_a_typed_input_error() -> None:
    def reject(*args: object) -> dict[str, object]:
        del args
        raise ValueError("input tokens exceed limit")

    backend = UpstreamSemIfBackend(
        object(),
        object(),
        {"source": "test", "revision": "revision"},
        reject,
    )

    assert backend.model_id == "semif-qwen3.5-4b"

    with pytest.raises(BackendInputError, match="input tokens exceed limit"):
        backend.score([{"id": "q", "state": "x", "question": "q", "options": []}])
