from __future__ import annotations

from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, field_validator

from .backend import BackendUnavailable, LayaBackend, UnavailableBackend


class SystemOneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: Literal["laya-multilingual"] | None = None
    state: Any
    questions: dict[str, dict[str, Any]]

    @field_validator("questions")
    @classmethod
    def questions_must_not_be_empty(
        cls, value: dict[str, dict[str, Any]]
    ) -> dict[str, dict[str, Any]]:
        if not value:
            raise ValueError("questions must not be empty")
        return value


def create_app(backend: LayaBackend | None = None) -> FastAPI:
    selected_backend = backend or UnavailableBackend()
    application = FastAPI(title="Laya Multilingual System One", version="0.1.0")

    @application.get("/health")
    def health(response: Response) -> dict[str, str | bool]:
        if not selected_backend.ready:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "ok" if selected_backend.ready else "unavailable",
            "ready": selected_backend.ready,
            "model": selected_backend.model_id,
        }

    @application.post("/v1/systemone")
    def system_one(request: SystemOneRequest) -> dict[str, Any]:
        try:
            return selected_backend.decide(request.state, request.questions)
        except BackendUnavailable as error:
            raise HTTPException(
                status_code=503,
                detail={"code": "backend_unavailable", "message": str(error)},
            ) from error
        except (KeyError, TypeError, ValueError) as error:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_model_input", "message": str(error)},
            ) from error

    return application


app = create_app()
