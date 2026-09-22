from __future__ import annotations

import pytest

from semif_service.adapter import (
    BackendProtocolError,
    UnsupportedQuestionError,
    build_rows,
    reconstruct_response,
)
from semif_service.models import SystemOneRequest


def test_choice_maps_to_native_semif_rows_without_claiming_wire_compatibility() -> None:
    request = SystemOneRequest.model_validate(
        {
            "state": {"ticket": "Payment failed"},
            "model": "semif-qwen3.5-4b",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": {"task": "Choose a queue"},
                    "criteria": {
                        "billing": "Payments and refunds",
                        "other": None,
                    },
                }
            },
        }
    )

    assert build_rows(request) == [
        {
            "id": "route",
            "state": {"ticket": "Payment failed"},
            "question": '{"task":"Choose a queue"}',
            "options": [
                {"id": "billing", "description": "Payments and refunds"},
                {"id": "other", "description": "other"},
            ],
        }
    ]


def test_empty_canonical_text_is_safe_for_the_semif_row_contract() -> None:
    request = SystemOneRequest.model_validate(
        {
            "state": "",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": "",
                    "criteria": {"billing": "Billing", "other": "Other"},
                }
            },
        }
    )

    row = build_rows(request)[0]
    assert row["question"] == "route"
    assert row["state"] == '""'


@pytest.mark.parametrize("question_type", ["score", "noul"])
def test_unsupported_question_kinds_are_rejected_instead_of_fabricated(
    question_type: str,
) -> None:
    criteria = ["low", "high"] if question_type == "score" else None
    request = SystemOneRequest.model_validate(
        {
            "state": "hello",
            "questions": {
                "q": {
                    "type": question_type,
                    "instructions": "Judge this",
                    **({"criteria": criteria} if criteria is not None else {}),
                }
            },
        }
    )

    with pytest.raises(UnsupportedQuestionError) as error:
        build_rows(request)

    assert error.value.question_id == "q"
    assert error.value.question_type == question_type


def test_semif_results_reconstruct_a_jev_choice_answer() -> None:
    request = SystemOneRequest.model_validate(
        {
            "state": "Payment failed",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": "Choose a queue",
                    "criteria": {"billing": "Billing", "other": "Everything else"},
                }
            },
        }
    )
    rows = build_rows(request)

    response = reconstruct_response(
        rows,
        [
            {
                "id": "route",
                "option_ids": ["billing", "other"],
                "probabilities": [0.8, 0.2],
                "input_tokens": 21,
            }
        ],
        model_id="semif:Qwen/Qwen3.5-4B@revision",
    )

    assert response.model_dump() == {
        "model": "semif:Qwen/Qwen3.5-4B@revision",
        "answers": {
            "route": {
                "type": "choice",
                "choice": "billing",
                "probabilities": {"billing": 0.8, "other": 0.2},
                "confidence": pytest.approx(0.6),
            }
        },
        "usage": {"input_tokens": 21, "output_tokens": 0},
    }


def test_backend_result_must_match_the_row_it_answers() -> None:
    request = SystemOneRequest.model_validate(
        {
            "state": "Payment failed",
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": "Choose a queue",
                    "criteria": {"billing": "Billing", "other": "Other"},
                }
            },
        }
    )
    rows = build_rows(request)

    with pytest.raises(BackendProtocolError, match="option_ids"):
        reconstruct_response(
            rows,
            [
                {
                    "id": "route",
                    "option_ids": ["other", "billing"],
                    "probabilities": [0.8, 0.2],
                    "input_tokens": 21,
                }
            ],
            model_id="test",
        )
