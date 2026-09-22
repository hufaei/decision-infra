import { describe, expect, test } from "vitest";

import { loadRegistry } from "./registry.js";

describe("model registry", () => {
  test("loads the four explicitly selected model ids", async () => {
    const registry = await loadRegistry();

    expect(registry.models.map((model) => model.id)).toEqual([
      "jev-latest",
      "reflex-qwen3.5-4b",
      "semif-qwen3.5-4b",
      "laya-multilingual",
    ]);
  });

  test("records revision-pinned local weights", async () => {
    const registry = await loadRegistry();
    const laya = registry.models.find(
      (model) => model.id === "laya-multilingual",
    );

    expect(laya?.download).toMatchObject({
      repo: "convaiinnovations/laya-multilingual",
      revision: "052592a15d198d9ad47da779604259b10b47b7aa",
    });
  });
});
