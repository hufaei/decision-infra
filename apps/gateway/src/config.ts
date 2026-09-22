import {
  ProviderRegistry,
  type DecisionProvider,
} from "../../../packages/core/src/index.js";
import {
  HttpDecisionProvider,
  JevProvider,
  ReflexProvider,
} from "../../../packages/provider-jev/src/index.js";

type Environment = Record<string, string | undefined>;
const LOCAL_MODEL_TIMEOUT_MS = 60_000;
const DEFAULT_LAYA_BASE_URL = "http://127.0.0.1:8010/v1/systemone";

export function createRegistry(env: Environment): ProviderRegistry {
  const providers: DecisionProvider[] = [
    new HttpDecisionProvider({
      id: "laya-multilingual",
      baseUrl: env.LAYA_BASE_URL || DEFAULT_LAYA_BASE_URL,
      timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
    }),
  ];

  if (env.TYPESAFE_API_KEY) {
    providers.push(new JevProvider({ apiKey: env.TYPESAFE_API_KEY }));
  }
  if (env.REFLEX_BASE_URL) {
    providers.push(
      new ReflexProvider({
        baseUrl: env.REFLEX_BASE_URL,
        timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
      }),
    );
  }
  if (env.SEMIF_BASE_URL) {
    providers.push(
      new HttpDecisionProvider({
        id: "semif-qwen3.5-4b",
        baseUrl: env.SEMIF_BASE_URL,
        timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
      }),
    );
  }

  const defaultModel =
    env.DECISION_DEFAULT_MODEL ||
    (env.TYPESAFE_API_KEY ? "jev-latest" : "laya-multilingual");
  const registry = new ProviderRegistry(providers, defaultModel);
  registry.get();
  return registry;
}
