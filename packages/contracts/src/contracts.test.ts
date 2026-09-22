import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";

import {
  DecisionRequestSchema,
  DecisionResponseSchema,
  QuestionSchema,
} from "./index.js";

describe("Jev decision contracts", () => {
  it("accepts the three question primitives and arbitrary JSON state", () => {
    expect(
      Value.Check(DecisionRequestSchema, {
        model: "typesafe-ai/jev",
        state: {
          ticket: ["duplicate charge", { amount: 680 }],
          verified: true,
          note: null,
        },
        questions: {
          action: {
            type: "choice",
            instructions: "Choose the safest action.",
            criteria: { allow: "Proceed.", review: "Ask a human." },
          },
          risk: {
            type: "score",
            instructions: "Score the risk.",
            criteria: ["Low", "High"],
          },
          needs_review: {
            type: "noul",
            instructions: "Does this need review?",
          },
        },
      }),
    ).toBe(true);

    expect(
      Value.Check(QuestionSchema, {
        type: "choice",
        instructions: { task: ["route", { safely: true }] },
        criteria: { allow: null, review: { when: "uncertain" } },
      }),
    ).toBe(true);

    expect(
      Value.Check(QuestionSchema, {
        type: "noul",
        instructions: "Is this relevant?",
        criteria: { true: "Relevant", false: "Irrelevant" },
      }),
    ).toBe(true);
  });

  it.each([
    {
      type: "choice",
      instructions: "Pick one.",
      criteria: ["not", "a", "record"],
    },
    {
      type: "score",
      instructions: "Score it.",
      criteria: { low: "Low", high: "High" },
    },
    {
      type: "noul",
      instructions: "True?",
      criteria: { yes: "Yes", no: "No" },
    },
  ])("rejects criteria that do not match $type", (question) => {
    expect(Value.Check(QuestionSchema, question)).toBe(false);
  });

  it("preserves Jev answer fields under caller-provided question keys", () => {
    expect(
      Value.Check(DecisionResponseSchema, {
        model: "jev-1.13.0",
        answers: {
          action: {
            type: "choice",
            choice: "review",
            probabilities: { allow: 0.1, review: 0.9 },
            confidence: 0.8,
          },
          risk: {
            type: "score",
            score: 1.7,
            probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
            confidence: 0.75,
            legend: { 0: "Low", 1: "Medium", 2: "High" },
          },
          needs_review: { type: "noul", noul: 0.92 },
        },
        usage: { input_tokens: 417, output_tokens: 69 },
      }),
    ).toBe(true);

    expect(
      Value.Check(DecisionResponseSchema, {
        model: "jev-1.13.0",
        answers: {
          risk: {
            type: "score",
            score: 0.5,
            probabilities: { 0: 0.5, 1: 0.5 },
            confidence: 0.5,
          },
        },
      }),
    ).toBe(false);

    expect(
      Value.Check(DecisionResponseSchema, {
        model: "jev-1.13.0",
        answers: {},
      }),
    ).toBe(false);

    expect(
      Value.Check(DecisionResponseSchema, {
        model: "laya-multilingual",
        answers: { needs_review: { type: "noul", noul: 0.92 } },
      }),
    ).toBe(true);
  });
});
