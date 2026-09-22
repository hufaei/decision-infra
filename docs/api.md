# `/v1/systemone` contract

This document is the portable boundary between an application and Decision Infra. Provider-specific details stay behind the gateway; an application selects an exact model ID and receives one typed answer per named question.

## Endpoint

```text
POST /v1/systemone
Content-Type: application/json
```

The gateway has no inbound authentication. It binds to `127.0.0.1:8080` by default and should remain on loopback or behind an authenticated reverse proxy.

Fastify's default request-body limit is 1 MiB.

## Request

```ts
type DecisionRequest = {
  model?: string;
  state: JsonValue;
  questions: Record<string, ChoiceQuestion | ScoreQuestion | NoulQuestion>;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
```

Rules:

- `model` is optional but, when present, must be a non-empty exact route ID.
- `state` may be any finite JSON value.
- `questions` must contain at least one non-empty question ID.
- `instructions` may be omitted or set to a string, object, array, or `null`.
- Descriptions may be strings, objects, arrays, or `null` where shown below.
- For portable calls, do not add undeclared fields. The gateway schema is permissive today, while stricter Python sidecars reject extras.

### `choice`

Select one named option and return a distribution over every option.

```json
{
  "type": "choice",
  "instructions": "Which team should handle this?",
  "criteria": {
    "billing": "Invoices, payments and refunds",
    "support": {"covers": ["bugs", "outages"]},
    "other": null
  }
}
```

`criteria` must contain at least one non-empty option ID. Individual providers may impose a higher minimum or maximum.

### `score`

Estimate a zero-based position on an ordered rubric.

```json
{
  "type": "score",
  "instructions": "How urgent is this request?",
  "criteria": ["not urgent", "soon", "critical"]
}
```

`criteria` is a non-empty ordered array. A response score may be fractional because it is the expected level under the returned distribution.

### `noul`

Return `P(true)` for a proposition. `criteria` is optional; when present, it may describe the `true` and `false` meanings.

```json
{
  "type": "noul",
  "instructions": "Does the user explicitly ask for a refund?",
  "criteria": {
    "true": "A direct refund request is present",
    "false": "No direct request is present"
  }
}
```

## Response

```ts
type DecisionResponse = {
  model: string;
  answers: Record<string, ChoiceAnswer | ScoreAnswer | NoulAnswer>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};
```

`model` is the stable route ID that produced the response. `usage` is optional because not every local runtime reports comparable token accounting.

### Choice answer

```json
{
  "type": "choice",
  "choice": "billing",
  "probabilities": {
    "billing": 0.91,
    "support": 0.06,
    "other": 0.03
  },
  "confidence": 0.91
}
```

### Score answer

```json
{
  "type": "score",
  "score": 1.72,
  "probabilities": {
    "0": 0.05,
    "1": 0.18,
    "2": 0.77
  },
  "confidence": 0.77,
  "legend": {
    "0": "not urgent",
    "1": "soon",
    "2": "critical"
  }
}
```

### Noul answer

```json
{
  "type": "noul",
  "noul": 0.88
}
```

`noul` is a number from 0 through 1 and represents `P(true)`.

## Provider compatibility

| Route ID | `choice` | `score` | `noul` | Important boundary |
|---|---:|---:|---:|---|
| `jev-latest` | ✅ | ✅ | ✅ | Hosted reference contract; account limits still apply |
| `reflex-qwen3.5-4b` | 2–26 options | 2–10 levels | ✅ | Missing instructions become the question ID |
| `semif-qwen3.5-4b` | 2–16 options | ❌ | ❌ | At most 64 questions; unsupported types return 501; questions run serially |
| `laya-multilingual` | ✅ | ✅ | ✅ | `max_len=1024`, `head_max_len=256`; keep choice sets below about 20 options |

Laya Multilingual ships without domain-specific temperature calibration. Treat its probabilities as experimental until they are validated and calibrated on the target domain.

## Routing

Available route IDs are registered at gateway startup.

- `TYPESAFE_API_KEY` registers `jev-latest`.
- `REFLEX_BASE_URL` registers `reflex-qwen3.5-4b`.
- `SEMIF_BASE_URL` registers `semif-qwen3.5-4b`.
- `laya-multilingual` is always registered; `LAYA_BASE_URL` overrides its default `http://127.0.0.1:8010/v1/systemone` URL.
- `DECISION_DEFAULT_MODEL` selects the model used when `model` is omitted.
- Without an explicit default, Jev is preferred when its key exists; otherwise Laya is selected.

An explicit unknown model never falls back. HTTP providers are not retried automatically.

Jev requests time out after 10 seconds. Local HTTP providers use 60 seconds to accommodate cold starts. A timeout does not prove that a remote provider stopped computing the request, so the gateway does not retry it.

## Gateway errors

| HTTP status | Body `error` | Meaning |
|---:|---|---|
| 400 | `invalid_request` | The body does not satisfy the base contract |
| 404 | `unknown_model` | The route ID is absent or not registered |
| Upstream status | `provider_http_error` | A provider rejected the call; body includes its HTTP status |
| 502 | `invalid_provider_response` | A provider returned invalid JSON or a response outside this contract |
| 503 | `provider_unavailable` | Network failure or timeout |
| 500 | Fastify default error | Unexpected local runtime or programming error |

Examples:

```json
{"error":"unknown_model","model":"jev-typo"}
```

```json
{"error":"provider_http_error","model":"semif-qwen3.5-4b","status":501}
```

```json
{"error":"provider_unavailable","model":"reflex-qwen3.5-4b"}
```

The gateway intentionally returns a small normalized error rather than exposing upstream exception text, paths, or model internals.

## Health endpoints

- Gateway: `GET /healthz`
- Reflex: `GET /health`
- SemIf: `GET /health`
- Laya: `GET /health`

`/healthz` proves only that the gateway process is running. It does not download, load, warm, or probe every optional model. Use each sidecar's health endpoint when deployment readiness matters.
