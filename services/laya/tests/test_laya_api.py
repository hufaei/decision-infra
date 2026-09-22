from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from laya_service.api import create_app


class FakeBackend:
    model_id = "laya-multilingual"
    ready = True

    def decide(self, state: Any, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        assert state == "duplicate charge"
        assert list(questions) == ["route"]
        return {
            "model": self.model_id,
            "answers": {
                "route": {
                    "type": "choice",
                    "choice": "billing",
                    "probabilities": {"billing": 0.9, "sales": 0.1},
                    "confidence": 0.8,
                }
            },
            "usage": {"input_tokens": 10, "output_tokens": 0},
        }


def test_system_one_delegates_without_loading_weights() -> None:
    client = TestClient(create_app(FakeBackend()))

    response = client.post(
        "/v1/systemone",
        json={
            "model": "laya-multilingual",
            "state": "duplicate charge",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": "Which team?",
                    "criteria": {"billing": None, "sales": None},
                }
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["model"] == "laya-multilingual"


def test_unconfigured_import_safe_app_reports_unavailable() -> None:
    client = TestClient(create_app())

    assert client.get("/health").status_code == 503
    assert (
        client.post(
            "/v1/systemone",
            json={"state": "x", "questions": {"flag": {"type": "noul"}}},
        ).status_code
        == 503
    )
