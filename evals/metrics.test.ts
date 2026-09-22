import { describe, expect, it } from "vitest";

import type { DecisionResponse } from "../packages/contracts/src/index.js";
import type { BenchmarkCase } from "./cases.js";
import { gradeResponse, percentile, stableDecisions } from "./metrics.js";

const testCase: BenchmarkCase = {
  id: "metrics",
  title: "metrics",
  request: { state: {}, questions: { x: { type: "noul" } } },
  expected: {
    action: { type: "choice", value: "heal" },
    danger: { type: "score", value: 3 },
    survives: { type: "noul", value: true },
  },
};

const response: DecisionResponse = {
  model: "test",
  answers: {
    action: { type: "choice", choice: "heal", probabilities: { heal: 0.8 }, confidence: 0.8 },
    danger: { type: "score", score: 2.6, probabilities: { "3": 0.6 }, confidence: 0.6, legend: {} },
    survives: { type: "noul", noul: 0.75 },
  },
};

describe("benchmark metrics", () => {
  it("grades all three contract answer types", () => {
    const graded = gradeResponse(testCase, response);
    expect(graded.map((answer) => answer.correct)).toEqual([true, true, true]);
    expect(graded[1]?.absoluteError).toBeCloseTo(0.4);
    expect(graded[2]?.brier).toBeCloseTo(0.0625);
  });

  it("uses nearest-rank percentiles and detects decision instability", () => {
    expect(percentile([50, 10, 30, 20, 40], 0.5)).toBe(30);
    const first = gradeResponse(testCase, response);
    expect(stableDecisions([first, first])).toBe(true);
    expect(stableDecisions([first, [{ ...first[0]!, observed: "shield" }, ...first.slice(1)]])).toBe(false);
  });
});
