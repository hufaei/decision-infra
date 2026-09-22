import { describe, expect, it, vi } from "vitest";

import type { DecisionRequest } from "../../contracts/src/index.js";
import {
  ProviderRegistry,
  UnknownModelError,
  type DecisionProvider,
} from "./index.js";

const request = (model?: string): DecisionRequest => ({
  ...(model === undefined ? {} : { model }),
  state: { task: "route me" },
  questions: {
    route: {
      type: "choice",
      instructions: "Choose a route.",
      criteria: { fast: "Fast", deep: "Deep" },
    },
  },
});

const provider = (id: string): DecisionProvider => ({
  id,
  decide: vi.fn(async () => ({
    model: id,
    answers: {
      route: {
        type: "choice" as const,
        choice: "fast",
        probabilities: { fast: 1, deep: 0 },
        confidence: 1,
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  })),
});

describe("ProviderRegistry", () => {
  it("routes explicit model ids by exact match", async () => {
    const jev = provider("typesafe-ai/jev");
    const preview = provider("typesafe-ai/jev-preview");
    const registry = new ProviderRegistry([jev, preview]);

    await registry.decide(request("typesafe-ai/jev"));

    expect(jev.decide).toHaveBeenCalledOnce();
    expect(preview.decide).not.toHaveBeenCalled();
  });

  it("throws for an unknown explicit model instead of falling back", async () => {
    const fallback = provider("typesafe-ai/jev");
    const registry = new ProviderRegistry([fallback], "typesafe-ai/jev");

    await expect(registry.decide(request("typesafe-ai/jev-typo"))).rejects.toEqual(
      new UnknownModelError("typesafe-ai/jev-typo"),
    );
    expect(fallback.decide).not.toHaveBeenCalled();
  });

  it("uses only the explicitly configured default when model is omitted", async () => {
    const selected = provider("typesafe-ai/jev");
    const registry = new ProviderRegistry([selected], "typesafe-ai/jev");

    await registry.decide(request());

    expect(selected.decide).toHaveBeenCalledWith({
      ...request(),
      model: "typesafe-ai/jev",
    });
    expect(() => new ProviderRegistry([selected]).get()).toThrow(
      new UnknownModelError(undefined),
    );
  });
});
