import type {
  DecisionRequest,
  DecisionResponse,
} from "../../contracts/src/index.js";

export interface DecisionProvider {
  readonly id: string;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
}

export class UnknownModelError extends Error {
  readonly model: string | undefined;

  constructor(model: string | undefined) {
    super(
      model === undefined
        ? "No model was specified and no default model is configured"
        : `Unknown model: ${model}`,
    );
    this.name = "UnknownModelError";
    this.model = model;
  }
}

export class ProviderRegistry {
  readonly #providers = new Map<string, DecisionProvider>();
  readonly #defaultModelId: string | undefined;

  constructor(
    providers: Iterable<DecisionProvider> = [],
    defaultModelId?: string,
  ) {
    this.#defaultModelId = defaultModelId;
    for (const provider of providers) this.register(provider);
  }

  register(provider: DecisionProvider): void {
    if (this.#providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.#providers.set(provider.id, provider);
  }

  get(model?: string): DecisionProvider {
    const selectedModel = model ?? this.#defaultModelId;
    if (selectedModel === undefined) throw new UnknownModelError(undefined);

    const provider = this.#providers.get(selectedModel);
    if (provider === undefined) throw new UnknownModelError(selectedModel);
    return provider;
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const provider = this.get(request.model);
    return provider.decide(
      request.model === undefined ? { ...request, model: provider.id } : request,
    );
  }
}
