import { Value } from "@sinclair/typebox/value";
import type {
  DecisionRequest,
  DecisionResponse,
} from "../../contracts/src/index.js";
import { DecisionResponseSchema } from "../../contracts/src/index.js";
import type { DecisionProvider } from "../../core/src/index.js";

const DEFAULT_BASE_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_TIMEOUT_MS = 10_000;

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpDecisionProviderErrorCode =
  | "http_error"
  | "invalid_response"
  | "network_error"
  | "timeout";

export class HttpDecisionProviderError extends Error {
  readonly code: HttpDecisionProviderErrorCode;
  readonly status: number | undefined;

  constructor(
    code: HttpDecisionProviderErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "HttpDecisionProviderError";
    this.code = code;
    this.status = status;
  }
}

export interface JevProviderOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: ProviderFetch;
}

export interface HttpDecisionProviderOptions {
  id: string;
  baseUrl: string;
  bearerToken?: string;
  timeoutMs?: number;
  fetch?: ProviderFetch;
}

export type ReflexProviderOptions = Omit<HttpDecisionProviderOptions, "id">;

export class HttpDecisionProvider implements DecisionProvider {
  readonly id: string;

  readonly #baseUrl: string;
  readonly #bearerToken: string | undefined;
  readonly #timeoutMs: number;
  readonly #fetch: ProviderFetch;

  constructor(options: HttpDecisionProviderOptions) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError(
        "HttpDecisionProvider timeoutMs must be a positive number",
      );
    }

    this.id = options.id;
    this.#baseUrl = options.baseUrl;
    this.#bearerToken = options.bearerToken;
    this.#timeoutMs = timeoutMs;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.#bearerToken !== undefined) {
        headers.authorization = `Bearer ${this.#bearerToken}`;
      }

      const response = await this.#fetch(this.#baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HttpDecisionProviderError(
          "http_error",
          `Decision provider ${this.id} request failed with HTTP ${response.status}`,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (timedOut) {
          throw new HttpDecisionProviderError(
            "timeout",
            `Decision provider ${this.id} timed out after ${this.#timeoutMs}ms`,
          );
        }
        throw new HttpDecisionProviderError(
          "invalid_response",
          `Decision provider ${this.id} returned invalid JSON`,
        );
      }

      if (!Value.Check(DecisionResponseSchema, payload)) {
        throw new HttpDecisionProviderError(
          "invalid_response",
          `Decision provider ${this.id} returned an invalid response`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof HttpDecisionProviderError) throw error;
      if (timedOut) {
        throw new HttpDecisionProviderError(
          "timeout",
          `Decision provider ${this.id} timed out after ${this.#timeoutMs}ms`,
        );
      }
      throw new HttpDecisionProviderError(
        "network_error",
        `Decision provider ${this.id} request failed due to a network error`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

const jevHttpOptions = (
  options: JevProviderOptions,
): HttpDecisionProviderOptions => {
  if (options.apiKey.length === 0) {
    throw new TypeError("JevProvider requires a non-empty API key");
  }

  return {
    id: "jev-latest",
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    bearerToken: options.apiKey,
    ...(options.timeoutMs === undefined
      ? {}
      : { timeoutMs: options.timeoutMs }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  };
};

export class JevProvider extends HttpDecisionProvider {
  constructor(options: JevProviderOptions) {
    super(jevHttpOptions(options));
  }

  override decide(request: DecisionRequest): Promise<DecisionResponse> {
    return super.decide(
      request.model === undefined ? { ...request, model: this.id } : request,
    );
  }
}

export class ReflexProvider extends HttpDecisionProvider {
  constructor(options: ReflexProviderOptions) {
    super({ ...options, id: "reflex-qwen3.5-4b" });
  }

  override decide(request: DecisionRequest): Promise<DecisionResponse> {
    const state =
      typeof request.state === "string" ||
      Array.isArray(request.state) ||
      (typeof request.state === "object" && request.state !== null)
        ? request.state
        : JSON.stringify(request.state);
    const questions = Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [
        id,
        { ...question, instructions: question.instructions ?? id },
      ]),
    ) as DecisionRequest["questions"];
    return super.decide({ ...request, state, questions });
  }
}

export {
  HttpDecisionProviderError as JevProviderError,
  type HttpDecisionProviderErrorCode as JevProviderErrorCode,
};
