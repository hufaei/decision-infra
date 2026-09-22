from __future__ import annotations

from fastapi import FastAPI, HTTPException, Response, status

from .adapter import (
    AdapterValidationError,
    BackendProtocolError,
    UnsupportedQuestionError,
    build_rows,
    reconstruct_response,
)
from .backend import BackendInputError, BackendUnavailable, SemIfBackend, UnavailableBackend
from .models import ErrorResponse, SystemOneRequest, SystemOneResponse


def create_app(backend: SemIfBackend | None = None) -> FastAPI:
    selected_backend = backend or UnavailableBackend()
    application = FastAPI(
        title="SemIf System One adapter",
        version="0.1.0",
        description="Choice-only mapping layer; SemIf itself is not Jev wire-compatible.",
    )

    @application.get("/health")
    def health(response: Response) -> dict[str, str | bool]:
        ready = getattr(selected_backend, "ready", True)
        if not ready:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "ok" if ready else "unavailable",
            "ready": ready,
            "model": selected_backend.model_id,
        }

    @application.post(
        "/v1/systemone",
        response_model=SystemOneResponse,
        responses={
            422: {"model": ErrorResponse},
            501: {"model": ErrorResponse},
            502: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
        },
    )
    def system_one(request: SystemOneRequest) -> SystemOneResponse:
        try:
            rows = build_rows(request)
            results = selected_backend.score(rows)
            return reconstruct_response(rows, results, model_id=selected_backend.model_id)
        except UnsupportedQuestionError as error:
            raise HTTPException(
                status_code=501,
                detail={
                    "code": "unsupported_question_type",
                    "message": (
                        "SemIf only exposes categorical option scores; "
                        f"{error.question_type} is unsupported"
                    ),
                    "question_id": error.question_id,
                    "question_type": error.question_type,
                },
            ) from error
        except AdapterValidationError as error:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "unsupported_semif_shape",
                    "message": str(error),
                    "question_id": error.question_id,
                },
            ) from error
        except BackendInputError as error:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_model_input", "message": str(error)},
            ) from error
        except BackendUnavailable as error:
            raise HTTPException(
                status_code=503,
                detail={"code": "backend_unavailable", "message": str(error)},
            ) from error
        except BackendProtocolError as error:
            raise HTTPException(
                status_code=502,
                detail={"code": "invalid_backend_result", "message": str(error)},
            ) from error

    return application


# Safe to import in tests and tooling: model creation and downloads happen only in the CLI.
app = create_app()
