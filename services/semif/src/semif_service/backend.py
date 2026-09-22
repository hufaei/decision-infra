from __future__ import annotations

from collections.abc import Callable, Sequence
from threading import Lock
from typing import Any, Protocol

from .adapter import SemIfRow


class BackendUnavailable(RuntimeError):
    pass


class BackendInputError(ValueError):
    pass


class SemIfBackend(Protocol):
    model_id: str
    ready: bool

    def score(self, rows: Sequence[SemIfRow]) -> list[dict[str, Any]]: ...


class UnavailableBackend:
    model_id = "semif:unconfigured"
    ready = False

    def score(self, rows: Sequence[SemIfRow]) -> list[dict[str, Any]]:
        del rows
        raise BackendUnavailable(
            "no SemIf backend is configured; launch with semif-systemone to load one"
        )


class UpstreamSemIfBackend:
    """Thin runtime wrapper around the revision-pinned optional SemIf dependency."""

    ready = True

    def __init__(
        self,
        model: Any,
        tokenizer: Any,
        metadata: dict[str, Any],
        score_one: Callable[..., dict[str, Any]],
        *,
        max_tokens: int = 4096,
    ) -> None:
        self._model = model
        self._tokenizer = tokenizer
        self._metadata = metadata
        self._score_one = score_one
        self._max_tokens = max_tokens
        self._lock = Lock()
        self.model_id = "semif-qwen3.5-4b"

    @classmethod
    def load(
        cls,
        source: str,
        revision: str,
        *,
        device: str = "auto",
        dtype: str = "bfloat16",
        max_tokens: int = 4096,
    ) -> UpstreamSemIfBackend:
        try:
            from semif_phase1.core import load_causal_model
            from semif_phase1.direct import score
        except ImportError as error:
            raise BackendUnavailable(
                "install the service with the 'model' extra to load SemIf"
            ) from error
        model, tokenizer, metadata = load_causal_model(source, revision, device, dtype)
        return cls(
            model,
            tokenizer,
            metadata,
            score,
            max_tokens=max_tokens,
        )

    def score(self, rows: Sequence[SemIfRow]) -> list[dict[str, Any]]:
        # Upstream model objects are stateful enough that concurrent forwards should be serialized.
        with self._lock:
            try:
                return [
                    self._score_one(
                        self._model,
                        self._tokenizer,
                        row,
                        self._metadata,
                        self._max_tokens,
                    )
                    for row in rows
                ]
            except ValueError as error:
                raise BackendInputError(str(error)) from error
