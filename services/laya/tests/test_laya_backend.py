from __future__ import annotations

import sys
from types import ModuleType
from typing import Any

from laya_service.backend import (
    MODEL_ID,
    MODEL_REPO,
    MODEL_REVISION,
    UpstreamLayaBackend,
)


class FakeAgent:
    def __init__(self) -> None:
        self.calls: list[tuple[Any, dict[str, dict[str, Any]]]] = []

    def system_one(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        self.calls.append((state, questions))
        return {
            "model": "laya-rl-agent",
            "answers": {"route": {"type": "choice", "choice": "billing"}},
            "usage": {"input_tokens": 12, "output_tokens": 0},
        }


def test_backend_preserves_contract_and_stable_model_id() -> None:
    agent = FakeAgent()
    backend = UpstreamLayaBackend(agent)

    result = backend.decide(
        {"body": "charged twice"},
        {"route": {"type": "choice", "criteria": {"billing": None, "sales": None}}},
    )

    assert agent.calls[0][1]["route"]["instructions"] == "route"
    assert result["model"] == MODEL_ID


def test_load_downloads_the_exact_official_revision(monkeypatch, tmp_path) -> None:
    calls: list[dict[str, Any]] = []
    agent_calls: list[tuple[str, str]] = []

    hub = ModuleType("huggingface_hub")

    def snapshot_download(**kwargs: Any) -> str:
        calls.append(kwargs)
        return str(tmp_path)

    hub.snapshot_download = snapshot_download  # type: ignore[attr-defined]
    runtime = ModuleType("laya")

    def agent_factory(path: str, *, device: str) -> FakeAgent:
        agent_calls.append((path, device))
        return FakeAgent()

    runtime.Agent = agent_factory  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "huggingface_hub", hub)
    monkeypatch.setitem(sys.modules, "laya", runtime)

    backend = UpstreamLayaBackend.load(device="cpu")

    assert backend.model_id == MODEL_ID
    assert calls == [
        {
            "repo_id": MODEL_REPO,
            "revision": MODEL_REVISION,
            "allow_patterns": [
                "rl_agent_config.json",
                "model.safetensors",
                "tokenizer/*",
                "encoder/*",
            ],
        }
    ]
    assert agent_calls == [(str(tmp_path), "cpu")]
