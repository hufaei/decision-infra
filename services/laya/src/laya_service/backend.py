from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol

MODEL_ID = "laya-multilingual"
MODEL_REPO = "convaiinnovations/laya-multilingual"
MODEL_REVISION = "052592a15d198d9ad47da779604259b10b47b7aa"
MODEL_FILES = [
    "rl_agent_config.json",
    "model.safetensors",
    "tokenizer/*",
    "encoder/*",
]


class BackendUnavailable(RuntimeError):
    pass


class LayaBackend(Protocol):
    model_id: str
    ready: bool

    def decide(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, Any]: ...


class UnavailableBackend:
    model_id = MODEL_ID
    ready = False

    def decide(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        del state, questions
        raise BackendUnavailable("no Laya backend is configured; launch with laya-systemone")


class UpstreamLayaBackend:
    model_id = MODEL_ID
    ready = True

    def __init__(self, agent: Any) -> None:
        self._agent = agent

    @classmethod
    def load(cls, *, device: str = "cpu") -> UpstreamLayaBackend:
        from huggingface_hub import snapshot_download
        from laya import Agent

        model_dir = snapshot_download(
            repo_id=MODEL_REPO,
            revision=MODEL_REVISION,
            allow_patterns=MODEL_FILES,
        )
        return cls(Agent(model_dir, device=device))

    def decide(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        normalized = deepcopy(questions)
        for question_id, question in normalized.items():
            if question.get("instructions") in (None, ""):
                question["instructions"] = question_id
        response = self._agent.system_one(state, normalized)
        response["model"] = self.model_id
        return response
