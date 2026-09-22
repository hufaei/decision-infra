import type { Answer, DecisionResponse } from "../packages/contracts/src/index.js";
import type { BenchmarkCase, ExpectedAnswer } from "./cases.js";

export interface GradedAnswer {
  question: string;
  expected: string | number | boolean;
  observed: string | number | boolean;
  correct: boolean;
  rawValue: number | string;
  probability?: number;
  absoluteError?: number;
  brier?: number;
}

export const percentile = (values: number[], fraction: number): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
};

function gradeOne(question: string, expected: ExpectedAnswer, answer: Answer): GradedAnswer {
  if (expected.type !== answer.type) {
    return {
      question,
      expected: expected.value,
      observed: `type:${answer.type}`,
      correct: false,
      rawValue: `type:${answer.type}`,
    };
  }

  if (answer.type === "choice" && expected.type === "choice") {
    const probability = answer.probabilities[expected.value];
    return {
      question,
      expected: expected.value,
      observed: answer.choice,
      rawValue: answer.choice,
      correct: answer.choice === expected.value,
      ...(probability === undefined ? {} : { probability }),
    };
  }
  if (answer.type === "score" && expected.type === "score") {
    const rounded = Math.round(answer.score);
    const absoluteError = Math.abs(answer.score - expected.value);
    const probability = answer.probabilities[String(expected.value)];
    return {
      question,
      expected: expected.value,
      observed: rounded,
      rawValue: answer.score,
      correct: absoluteError <= 0.5,
      absoluteError,
      ...(probability === undefined ? {} : { probability }),
    };
  }
  if (answer.type === "noul" && expected.type === "noul") {
    const observed = answer.noul >= 0.5;
    const numericExpected = expected.value ? 1 : 0;
    return {
      question,
      expected: expected.value,
      observed,
      rawValue: answer.noul,
      correct: observed === expected.value,
      probability: expected.value ? answer.noul : 1 - answer.noul,
      brier: (answer.noul - numericExpected) ** 2,
    };
  }
  throw new Error(`Unsupported answer type for ${question}`);
}

export function gradeResponse(testCase: BenchmarkCase, response: DecisionResponse): GradedAnswer[] {
  return Object.entries(testCase.expected).map(([question, expected]) => {
    const answer = response.answers[question];
    if (answer === undefined) {
      return {
        question,
        expected: expected.value,
        observed: "missing",
        rawValue: "missing",
        correct: false,
      };
    }
    return gradeOne(question, expected, answer);
  });
}

export const stableDecisions = (runs: GradedAnswer[][]): boolean => {
  if (runs.length < 2) return true;
  const signature = (answers: GradedAnswer[]) =>
    JSON.stringify(answers.map(({ question, observed }) => [question, observed]));
  return runs.every((run) => signature(run) === signature(runs[0]!));
};
