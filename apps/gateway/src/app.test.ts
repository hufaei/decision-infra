import { describe, expect, test } from "vitest";

import type {
  DecisionRequest,
  DecisionResponse,
} from "../../../packages/contracts/src/index.js";
import {
  ProviderRegistry,
  type DecisionProvider,
} from "../../../packages/core/src/index.js";
import { HttpDecisionProviderError } from "../../../packages/provider-jev/src/index.js";
import { buildApp } from "./app.js";

const response: DecisionResponse = {
  model: "jev-latest",
  answers: { relevant: { type: "noul", noul: 0.9 } },
  usage: { input_tokens: 8, output_tokens: 1 },
};

const provider: DecisionProvider = {
  id: "jev-latest",
  decide: async (_request: DecisionRequest) => response,
};

describe("gateway", () => {
  test("serves the canonical System One endpoint through the configured default", async () => {
    const app = buildApp(new ProviderRegistry([provider], "jev-latest"));

    const result = await app.inject({
      method: "POST",
      url: "/v1/systemone",
      payload: {
        state: "The invoice was charged twice.",
        questions: {
          relevant: {
            type: "noul",
            instructions: "Is this a billing issue?",
          },
        },
      },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual(response);
    await app.close();
  });

  test("rejects an unknown explicit model without falling back", async () => {
    const app = buildApp(new ProviderRegistry([provider], "jev-latest"));

    const result = await app.inject({
      method: "POST",
      url: "/v1/systemone",
      payload: {
        model: "jev-typo",
        state: "test",
        questions: {
          relevant: { type: "noul", instructions: "Is this relevant?" },
        },
      },
    });

    expect(result.statusCode).toBe(404);
    expect(result.json()).toEqual({ error: "unknown_model", model: "jev-typo" });
    await app.close();
  });

  test("reports a configured but stopped HTTP provider as unavailable", async () => {
    const stopped: DecisionProvider = {
      id: "reflex-qwen3.5-4b",
      decide: async () => {
        throw new HttpDecisionProviderError("network_error", "connection refused");
      },
    };
    const app = buildApp(new ProviderRegistry([stopped], stopped.id));

    const result = await app.inject({
      method: "POST",
      url: "/v1/systemone",
      payload: {
        model: stopped.id,
        state: "test",
        questions: {
          relevant: { type: "noul", instructions: "Is this relevant?" },
        },
      },
    });

    expect(result.statusCode).toBe(503);
    expect(result.json()).toEqual({
      error: "provider_unavailable",
      model: stopped.id,
    });
    await app.close();
  });

  test("reports the resolved default model when an HTTP provider is unavailable", async () => {
    const stopped: DecisionProvider = {
      id: "reflex-qwen3.5-4b",
      decide: async () => {
        throw new HttpDecisionProviderError("network_error", "connection refused");
      },
    };
    const app = buildApp(new ProviderRegistry([stopped], stopped.id));

    const result = await app.inject({
      method: "POST",
      url: "/v1/systemone",
      payload: {
        state: "test",
        questions: {
          relevant: { type: "noul", instructions: "Is this relevant?" },
        },
      },
    });

    expect(result.statusCode).toBe(503);
    expect(result.json()).toEqual({
      error: "provider_unavailable",
      model: stopped.id,
    });
    await app.close();
  });

  test("preserves a provider capability error status", async () => {
    const limited: DecisionProvider = {
      id: "semif-qwen3.5-4b",
      decide: async () => {
        throw new HttpDecisionProviderError(
          "http_error",
          "unsupported question type",
          501,
        );
      },
    };
    const app = buildApp(new ProviderRegistry([limited], limited.id));

    const result = await app.inject({
      method: "POST",
      url: "/v1/systemone",
      payload: {
        model: limited.id,
        state: "test",
        questions: {
          relevant: { type: "noul", instructions: "Is this relevant?" },
        },
      },
    });

    expect(result.statusCode).toBe(501);
    expect(result.json()).toEqual({
      error: "provider_http_error",
      model: limited.id,
      status: 501,
    });
    await app.close();
  });
});
