import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { Value } from "@sinclair/typebox/value";

import {
  DecisionResponseSchema,
  type DecisionResponse,
} from "../packages/contracts/src/index.js";
import { benchmarkCases } from "./cases.js";
import { gradeResponse, percentile, stableDecisions, type GradedAnswer } from "./metrics.js";

interface RunResult {
  variant: "original" | "reversed-choice-options";
  latencyMs: number;
  response: DecisionResponse;
  graded: GradedAnswer[];
}

interface CaseResult {
  id: string;
  title: string;
  runs: RunResult[];
  stable: boolean;
}

interface ModelResult {
  model: string;
  cases: CaseResult[];
}

const baseUrl = process.env.BENCHMARK_BASE_URL ?? "http://127.0.0.1:8080";
const models = (process.env.BENCHMARK_MODELS ?? "jev-latest,laya-multilingual")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const runs = Number(process.env.BENCHMARK_RUNS ?? "3");
const outputJson = resolve(process.env.BENCHMARK_JSON ?? "outputs/benchmark-results.json");
const outputMarkdown = resolve(process.env.BENCHMARK_REPORT ?? "outputs/benchmark-report.md");

if (!Number.isInteger(runs) || runs < 1) throw new Error("BENCHMARK_RUNS must be a positive integer");
if (models.length === 0) throw new Error("BENCHMARK_MODELS must contain at least one model");

function reverseChoiceOptions(testCase: (typeof benchmarkCases)[number]) {
  return {
    ...testCase,
    request: {
      ...testCase.request,
      questions: Object.fromEntries(
        Object.entries(testCase.request.questions).map(([id, question]) => [
          id,
          question.type === "choice"
            ? { ...question, criteria: Object.fromEntries(Object.entries(question.criteria).reverse()) }
            : question,
        ]),
      ),
    },
  } as (typeof benchmarkCases)[number];
}

async function decide(
  model: string,
  testCase = benchmarkCases[0]!,
  variant: RunResult["variant"] = "original",
): Promise<RunResult> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/v1/systemone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...testCase.request, model }),
  });
  const latencyMs = performance.now() - started;
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`${model}/${testCase.id}: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  if (!Value.Check(DecisionResponseSchema, payload)) {
    throw new Error(`${model}/${testCase.id}: response violates DecisionResponse contract`);
  }
  return { variant, latencyMs, response: payload, graded: gradeResponse(testCase, payload) };
}

function format(value: unknown): string {
  if (typeof value === "number") return value.toFixed(3).replace(/\.0+$/, "");
  return String(value);
}

function summarizeModel(result: ModelResult) {
  const allRuns = result.cases.flatMap((testCase) => testCase.runs);
  const representative = result.cases.flatMap((testCase) => testCase.runs[0]?.graded ?? []);
  const scoreAnswers = representative.filter((answer) => answer.absoluteError !== undefined);
  const noulAnswers = representative.filter((answer) => answer.brier !== undefined);
  const byType = Object.fromEntries(
    (["choice", "score", "noul"] as const).map((type) => {
      const answers = result.cases.flatMap((testCase) => {
        const expected = benchmarkCases.find((item) => item.id === testCase.id)!.expected;
        return (testCase.runs[0]?.graded ?? []).filter((answer) => expected[answer.question]?.type === type);
      });
      return [type, { correct: answers.filter((answer) => answer.correct).length, total: answers.length }];
    }),
  ) as Record<"choice" | "score" | "noul", { correct: number; total: number }>;
  const macroAccuracy =
    (["choice", "score", "noul"] as const).reduce(
      (sum, type) => sum + byType[type].correct / byType[type].total,
      0,
    ) / 3;
  const latencies = allRuns.map((run) => run.latencyMs);
  return {
    model: result.model,
    decisionsCorrect: representative.filter((answer) => answer.correct).length,
    decisionsTotal: representative.length,
    scenariosPassed: result.cases.filter((testCase) =>
      (testCase.runs[0]?.graded ?? []).every((answer) => answer.correct),
    ).length,
    scenariosTotal: result.cases.length,
    stableScenarios: result.cases.filter((testCase) => testCase.stable).length,
    byType,
    macroAccuracy,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    meanScoreMae:
      scoreAnswers.length === 0
        ? null
        : scoreAnswers.reduce((sum, answer) => sum + answer.absoluteError!, 0) / scoreAnswers.length,
    meanNoulBrier:
      noulAnswers.length === 0
        ? null
        : noulAnswers.reduce((sum, answer) => sum + answer.brier!, 0) / noulAnswers.length,
  };
}

function markdown(results: ModelResult[], startedAt: string): string {
  const lines = [
    "# Jev vs Laya：10 例真实基准",
    "",
    `- 时间：${startedAt}`,
    `- 网关：\`${baseUrl}\``,
    `- 方法：每模型预热 1 次（不计时），每用例 ${runs} 次真实 HTTP 调用；延时为端到端 wall-clock。`,
    "- 位置偏差：choice 的第 2 次运行倒序选项，其余输入语义不变；两个模型收到完全相同的运行序列。",
    "- 判定：choice 精确匹配；score 与目标 level 的绝对误差 ≤0.5，并记录原始 MAE；noul 以 0.5 为阈值并计算 Brier。",
    "- 规模：10 个场景、12 个判定。该小样本用于方向性比较，不代表统计显著的通用排名。",
    "",
    "## 汇总",
    "",
    "| 模型 | Macro 准确率 | choice | score | noul | 场景全对 | 稳定场景 | p50 | p95 | score MAE | noul Brier |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const result of results) {
    const summary = summarizeModel(result);
    lines.push(
      `| ${summary.model} | ${(summary.macroAccuracy * 100).toFixed(1)}% | ${summary.byType.choice.correct}/${summary.byType.choice.total} | ${summary.byType.score.correct}/${summary.byType.score.total} | ${summary.byType.noul.correct}/${summary.byType.noul.total} | ${summary.scenariosPassed}/${summary.scenariosTotal} | ${summary.stableScenarios}/${summary.scenariosTotal} | ${summary.p50Ms.toFixed(1)} ms | ${summary.p95Ms.toFixed(1)} ms | ${summary.meanScoreMae?.toFixed(3) ?? "—"} | ${summary.meanNoulBrier?.toFixed(3) ?? "—"} |`,
    );
  }

  for (const result of results) {
    lines.push("", `## ${result.model}`, "", "| 用例 | 期望 | 首次观测 | 正确 | 3 次稳定 | 中位延时 |", "|---|---|---|---:|---:|---:|");
    for (const testCase of result.cases) {
      const first = testCase.runs[0]!;
      const expected = first.graded.map((answer) => `${answer.question}=${format(answer.expected)}`).join("; ");
      const observed = first.graded.map((answer) => `${answer.question}=${format(answer.rawValue)}`).join("; ");
      const correct = first.graded.every((answer) => answer.correct) ? "✅" : "❌";
      const median = percentile(testCase.runs.map((run) => run.latencyMs), 0.5);
      lines.push(`| ${testCase.id} ${testCase.title} | ${expected} | ${observed} | ${correct} | ${testCase.stable ? "✅" : "❌"} | ${median.toFixed(1)} ms |`);
    }
  }
  lines.push(
    "",
    "## 解读边界",
    "",
    "- Jev 是远程托管调用，延时包含公网与服务端；Laya 是本机推理，二者的端到端数字刻意按应用实际体验比较。",
    "- Laya 概率未经本业务域校准；Brier 与期望标签概率仅供本次相对观察。",
    "- 原始逐次响应和延时在同目录 JSON 中，报告不包含 API key。",
    "",
  );
  return lines.join("\n");
}

const startedAt = new Date().toISOString();
const results: ModelResult[] = [];

for (const model of models) {
  process.stdout.write(`warm-up ${model}... `);
  await decide(model);
  process.stdout.write("ok\n");
  const cases: CaseResult[] = [];
  for (const testCase of benchmarkCases) {
    const measured: RunResult[] = [];
    for (let run = 0; run < runs; run += 1) {
      const reversed =
        run === 1 &&
        Object.values(testCase.request.questions).some((question) => question.type === "choice");
      measured.push(
        await decide(
          model,
          reversed ? reverseChoiceOptions(testCase) : testCase,
          reversed ? "reversed-choice-options" : "original",
        ),
      );
    }
    cases.push({
      id: testCase.id,
      title: testCase.title,
      runs: measured,
      stable: stableDecisions(measured.map((result) => result.graded)),
    });
    process.stdout.write(`${model} ${testCase.id}: ${measured.map((item) => item.latencyMs.toFixed(0)).join("/")} ms\n`);
  }
  results.push({ model, cases });
}

const artifact = {
  startedAt,
  completedAt: new Date().toISOString(),
  baseUrl,
  runsPerCase: runs,
  results,
  summary: results.map(summarizeModel),
};
await mkdir(dirname(outputJson), { recursive: true });
await mkdir(dirname(outputMarkdown), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
await writeFile(outputMarkdown, markdown(results, startedAt), "utf8");
process.stdout.write(`wrote ${outputJson}\nwrote ${outputMarkdown}\n`);
