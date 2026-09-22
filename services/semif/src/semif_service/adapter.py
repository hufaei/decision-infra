from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any, TypedDict

from .models import (
    ChoiceAnswer,
    ChoiceQuestion,
    SystemOneRequest,
    SystemOneResponse,
    Usage,
    ensure_probability,
)


class SemIfOption(TypedDict):
    id: str
    description: str


class SemIfRow(TypedDict):
    id: str
    state: Any
    question: str
    options: list[SemIfOption]


class UnsupportedQuestionError(ValueError):
    def __init__(self, question_id: str, question_type: str) -> None:
        self.question_id = question_id
        self.question_type = question_type
        super().__init__(f"SemIf does not support {question_type!r} question {question_id!r}")


class AdapterValidationError(ValueError):
    def __init__(self, message: str, *, question_id: str | None = None) -> None:
        self.question_id = question_id
        super().__init__(message)


class BackendProtocolError(RuntimeError):
    """Raised when a backend result cannot be safely associated with its request row."""


def render_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    return json.dumps(
        content,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def build_rows(request: SystemOneRequest) -> list[SemIfRow]:
    """Map Jev questions to SemIf's native rows; no HTTP compatibility is implied."""
    rows: list[SemIfRow] = []
    state = request.state
    if not isinstance(state, (str, dict, list)) or not state:
        state = json.dumps(
            state,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    for question_id, question in request.questions.items():
        if not isinstance(question, ChoiceQuestion):
            raise UnsupportedQuestionError(question_id, question.type)
        if not 2 <= len(question.criteria) <= 16:
            raise AdapterValidationError(
                "SemIf choice criteria must contain 2-16 options",
                question_id=question_id,
            )
        options: list[SemIfOption] = []
        for option_id, description in question.criteria.items():
            # Jev's null means the label is self-describing. SemIf requires a string.
            rendered = option_id if description is None else render_content(description)
            options.append({"id": option_id, "description": rendered})
        rows.append(
            {
                "id": question_id,
                "state": state,
                "question": (
                    question_id
                    if question.instructions is None or question.instructions == ""
                    else render_content(question.instructions)
                ),
                "options": options,
            }
        )
    return rows


def _choice_confidence(probabilities: Sequence[float]) -> float:
    count = len(probabilities)
    chance = 1.0 / count
    confidence = (max(probabilities) - chance) / (1.0 - chance)
    return min(1.0, max(0.0, confidence))


def reconstruct_response(
    rows: Sequence[SemIfRow],
    results: Sequence[Mapping[str, Any]],
    *,
    model_id: str,
) -> SystemOneResponse:
    """Validate native SemIf results and reconstruct the supported Jev answer shape."""
    if len(results) != len(rows):
        raise BackendProtocolError(f"backend returned {len(results)} results for {len(rows)} rows")

    by_id: dict[str, Mapping[str, Any]] = {}
    for result in results:
        result_id = result.get("id")
        if not isinstance(result_id, str) or result_id in by_id:
            raise BackendProtocolError("backend result ids must be unique strings")
        by_id[result_id] = result

    answers: dict[str, ChoiceAnswer] = {}
    total_input_tokens = 0
    for row in rows:
        result = by_id.get(row["id"])
        if result is None:
            raise BackendProtocolError(f"backend omitted result for {row['id']!r}")
        expected_ids = [option["id"] for option in row["options"]]
        if result.get("option_ids") != expected_ids:
            raise BackendProtocolError(f"backend option_ids do not match row {row['id']!r}")
        raw_probabilities = result.get("probabilities")
        if not isinstance(raw_probabilities, (list, tuple)) or len(raw_probabilities) != len(
            expected_ids
        ):
            raise BackendProtocolError(f"backend probabilities do not match row {row['id']!r}")
        try:
            probabilities = [ensure_probability(value) for value in raw_probabilities]
        except (TypeError, ValueError) as error:
            raise BackendProtocolError(str(error)) from error
        total = sum(probabilities)
        if total <= 0:
            raise BackendProtocolError("backend probability mass must be positive")
        probabilities = [value / total for value in probabilities]

        input_tokens = result.get("input_tokens")
        if isinstance(input_tokens, bool) or not isinstance(input_tokens, int) or input_tokens < 0:
            raise BackendProtocolError("backend input_tokens must be a nonnegative integer")
        total_input_tokens += input_tokens

        winner_index = max(range(len(probabilities)), key=probabilities.__getitem__)
        answers[row["id"]] = ChoiceAnswer(
            choice=expected_ids[winner_index],
            probabilities=dict(zip(expected_ids, probabilities, strict=True)),
            confidence=_choice_confidence(probabilities),
        )

    return SystemOneResponse(
        model=model_id,
        answers=answers,
        usage=Usage(input_tokens=total_input_tokens, output_tokens=0),
    )
