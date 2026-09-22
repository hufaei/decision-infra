from __future__ import annotations

from fastapi.testclient import TestClient

from semif_service.api import create_app
from semif_service.backend import BackendInputError


class FakeBackend:
    model_id = "semif:test"

    def score(self, rows: list[dict]) -> list[dict]:
        assert rows[0]["id"] == "route"
        return [
            {
                "id": "route",
                "option_ids": ["billing", "other"],
                "probabilities": [0.75, 0.25],
                "input_tokens": 12,
            }
        ]


class InvalidInputBackend(FakeBackend):
    def score(self, rows: list[dict]) -> list[dict]:
        del rows
        raise BackendInputError("input tokens exceed limit")


def test_systemone_endpoint_uses_an_injected_backend() -> None:
    client = TestClient(create_app(FakeBackend()))

    response = client.post(
        "/v1/systemone",
        json={
            "state": "Payment failed",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": "Choose a queue",
                    "criteria": {"billing": "Billing", "other": "Other"},
                }
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["answers"]["route"] == {
        "type": "choice",
        "choice": "billing",
        "probabilities": {"billing": 0.75, "other": 0.25},
        "confidence": 0.5,
    }


def test_systemone_endpoint_returns_typed_501_for_noul() -> None:
    client = TestClient(create_app(FakeBackend()))

    response = client.post(
        "/v1/systemone",
        json={
            "state": "Payment failed",
            "questions": {"urgent": {"type": "noul", "instructions": "Is this urgent?"}},
        },
    )

    assert response.status_code == 501
    assert response.json() == {
        "detail": {
            "code": "unsupported_question_type",
            "message": "SemIf only exposes categorical option scores; noul is unsupported",
            "question_id": "urgent",
            "question_type": "noul",
        }
    }


def test_systemone_endpoint_returns_typed_422_for_backend_input_limits() -> None:
    client = TestClient(create_app(InvalidInputBackend()))

    response = client.post(
        "/v1/systemone",
        json={
            "state": "Payment failed",
            "questions": {
                "route": {
                    "type": "choice",
                    "criteria": {"billing": "Billing", "other": "Other"},
                }
            },
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_model_input"


def test_systemone_endpoint_rejects_another_model_identity() -> None:
    client = TestClient(create_app(FakeBackend()))

    response = client.post(
        "/v1/systemone",
        json={
            "model": "jev-latest",
            "state": "Payment failed",
            "questions": {
                "route": {
                    "type": "choice",
                    "criteria": {"billing": "Billing", "other": "Other"},
                }
            },
        },
    )

    assert response.status_code == 422
