from __future__ import annotations

import json
import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_json(value: Any, *, field_name: str) -> Any:
    try:
        json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be finite JSON-compatible data") from error
    return value


def _validate_content(value: Any, *, field_name: str) -> Any:
    if not isinstance(value, (str, dict, list)):
        # Pydantic v2 intentionally does not convert TypeError into a validation error.
        raise ValueError(f"{field_name} must be a string, object, or array")  # noqa: TRY004
    return _validate_json(value, field_name=field_name)


def _validate_identifier(value: str, *, field_name: str) -> str:
    if not value or len(value) > 200:
        raise ValueError(f"{field_name} must contain 1-200 characters")
    return value


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChoiceQuestion(WireModel):
    type: Literal["choice"]
    instructions: Any | None = None
    criteria: dict[str, Any | None]

    @field_validator("instructions")
    @classmethod
    def validate_instructions(cls, value: Any) -> Any:
        if value is None:
            return None
        return _validate_content(value, field_name="instructions")

    @field_validator("criteria")
    @classmethod
    def validate_criteria(cls, value: dict[str, Any | None]) -> dict[str, Any | None]:
        for option_id, description in value.items():
            _validate_identifier(option_id, field_name="option id")
            if description is not None:
                _validate_content(description, field_name=f"criteria[{option_id!r}]")
        return value


class ScoreQuestion(WireModel):
    type: Literal["score"]
    instructions: Any | None = None
    criteria: list[Any]

    @field_validator("instructions")
    @classmethod
    def validate_instructions(cls, value: Any) -> Any:
        if value is None:
            return None
        return _validate_content(value, field_name="instructions")

    @field_validator("criteria")
    @classmethod
    def validate_criteria(cls, value: list[Any]) -> list[Any]:
        if not value:
            raise ValueError("score criteria must not be empty")
        for level in value:
            _validate_content(level, field_name="score criterion")
        return value


class NoulQuestion(WireModel):
    type: Literal["noul"]
    instructions: Any | None = None
    criteria: dict[Literal["true", "false"], Any | None] | None = None

    @field_validator("instructions")
    @classmethod
    def validate_instructions(cls, value: Any) -> Any:
        if value is None:
            return None
        return _validate_content(value, field_name="instructions")

    @field_validator("criteria")
    @classmethod
    def validate_criteria(
        cls, value: dict[Literal["true", "false"], Any] | None
    ) -> dict[Literal["true", "false"], Any | None] | None:
        if value is not None:
            for description in value.values():
                if description is not None:
                    _validate_content(description, field_name="noul criterion")
        return value


Question = Annotated[ChoiceQuestion | ScoreQuestion | NoulQuestion, Field(discriminator="type")]


class SystemOneRequest(WireModel):
    state: Any
    questions: dict[str, Question]
    model: Literal["semif-qwen3.5-4b"] | None = None

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: Any) -> Any:
        return _validate_json(value, field_name="state")

    @field_validator("questions")
    @classmethod
    def validate_questions(cls, value: dict[str, Question]) -> dict[str, Question]:
        if not 1 <= len(value) <= 64:
            raise ValueError("questions must contain 1-64 entries")
        for question_id in value:
            _validate_identifier(question_id, field_name="question id")
        return value


class ChoiceAnswer(WireModel):
    type: Literal["choice"] = "choice"
    choice: str
    probabilities: dict[str, float]
    confidence: float


class Usage(WireModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class SystemOneResponse(WireModel):
    model: str
    answers: dict[str, ChoiceAnswer]
    usage: Usage


class ErrorDetail(WireModel):
    code: str
    message: str
    question_id: str | None = None
    question_type: str | None = None


class ErrorResponse(WireModel):
    detail: ErrorDetail


def ensure_probability(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError("probabilities must be numbers")
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError("probabilities must be finite and nonnegative")
    return result
