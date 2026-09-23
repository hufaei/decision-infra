import { describe, expect, it, vi } from "vitest";

import type {
  DecisionRequest,
  DecisionResponse,
} from "../../contracts/src/index.js";
import {
  HttpDecisionProvider,
  HttpDecisionProviderError,
  JevProvider,
  ReflexProvider,
  type ProviderFetch,
} from "./index.js";

const request: DecisionRequest = {
  state: { ticket: "I need a refund" },
  questions: {
    refund: { type: "noul", instructions: "Is a refund requested?" },
  },
};

const response: DecisionResponse = {
  model: "jev-latest",
  answers: { refund: { type: "noul", noul: 0.97 } },
  usage: { input_tokens: 12, output_tokens: 0 },
};

describe("JevProvider", () => {
  it("posts the Jev request with bearer authentication and returns the JSON response", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = new JevProvider({ apiKey: "secret-key", fetch });

    expect(provider.id).toBe("jev-latest");
    await expect(provider.decide(request)).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.typesafe.ai/v1/systemone",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer secret-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({ ...request, model: "jev-latest" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("posts to a configured endpoint", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const provider = new JevProvider({
      apiKey: "secret-key",
      baseUrl: "http://127.0.0.1:9000/v1/systemone",
      fetch,
    });

    await provider.decide(request);

    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:9000/v1/systemone",
      expect.any(Object),
    );
  });

  it("normalizes an upstream release name to the stable gateway route", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ...response, model: "jev-1.13.0" }), {
        status: 200,
      }),
    );
    const provider = new JevProvider({ apiKey: "secret-key", fetch });

    await expect(provider.decide(request)).resolves.toMatchObject({
      model: "jev-latest",
    });
  });

  it.each([
    {
      label: "non-success status",
      fetch: async () => new Response("denied", { status: 401 }),
      expected: { code: "http_error", status: 401 },
    },
    {
      label: "invalid JSON",
      fetch: async () => new Response("not JSON", { status: 200 }),
      expected: { code: "invalid_response" },
    },
    {
      label: "invalid response shape",
      fetch: async () => new Response("{}", { status: 200 }),
      expected: { code: "invalid_response" },
    },
    {
      label: "network failure",
      fetch: async () => {
        throw new Error("socket failed");
      },
      expected: { code: "network_error" },
    },
  ])("maps $label to a provider error", async ({ fetch, expected }) => {
    const provider = new JevProvider({ apiKey: "do-not-leak", fetch });

    const error = await provider.decide(request).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(HttpDecisionProviderError);
    expect(error).toMatchObject(expected);
    expect(String(error)).not.toContain("do-not-leak");
  });

  it("aborts and reports requests that exceed the configured timeout", async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const provider = new JevProvider({ apiKey: "secret", timeoutMs: 5, fetch });

    await expect(provider.decide(request)).rejects.toMatchObject({
      name: "HttpDecisionProviderError",
      code: "timeout",
    });
  });

  it("keeps the timeout active while consuming the response body", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        }),
        { status: 200 },
      ),
    );
    const provider = new JevProvider({ apiKey: "secret", timeoutMs: 5, fetch });

    await expect(provider.decide(request)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("omits authorization when a local HTTP provider has no bearer token", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const provider = new HttpDecisionProvider({
      id: "reflex-qwen3.5-4b",
      baseUrl: "http://127.0.0.1:8008/v1/systemone",
      fetch,
    });

    await provider.decide(request);

    expect(provider.id).toBe("reflex-qwen3.5-4b");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8008/v1/systemone",
      expect.objectContaining({
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("fills Reflex-required text without narrowing the gateway contract", async () => {
    const fetch = vi.fn<ProviderFetch>(async () =>
      new Response(JSON.stringify(response), { status: 200 }),
    );
    const provider = new ReflexProvider({
      baseUrl: "http://127.0.0.1:8008/v1/systemone",
      fetch,
    });

    await provider.decide({
      model: provider.id,
      state: null,
      questions: {
        route: {
          type: "choice",
          criteria: { billing: "Billing", other: "Other" },
        },
      },
    });

    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      state: "null",
      questions: { route: { instructions: "route" } },
    });
  });
});
