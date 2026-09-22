import { Value } from "@sinclair/typebox/value";
import Fastify from "fastify";

import {
  DecisionRequestSchema,
  type DecisionRequest,
} from "../../../packages/contracts/src/index.js";
import {
  ProviderRegistry,
  UnknownModelError,
} from "../../../packages/core/src/index.js";
import { HttpDecisionProviderError } from "../../../packages/provider-jev/src/index.js";

export function buildApp(registry: ProviderRegistry) {
  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ status: "ok" }));
  app.post("/v1/systemone", async (request, reply) => {
    if (!Value.Check(DecisionRequestSchema, request.body)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const body = request.body as DecisionRequest;
    let model = body.model;

    try {
      model = registry.get(model).id;
      return await registry.decide(body);
    } catch (error) {
      if (error instanceof UnknownModelError) {
        return reply
          .code(404)
          .send({ error: "unknown_model", model: error.model });
      }
      if (error instanceof HttpDecisionProviderError) {
        if (error.code === "http_error" && error.status !== undefined) {
          return reply.code(error.status).send({
            error: "provider_http_error",
            model,
            status: error.status,
          });
        }
        if (error.code === "invalid_response") {
          return reply.code(502).send({
            error: "invalid_provider_response",
            model,
          });
        }
        return reply.code(503).send({
          error: "provider_unavailable",
          model,
        });
      }
      throw error;
    }
  });

  return app;
}
