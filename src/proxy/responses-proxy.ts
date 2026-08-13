import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Provider, ProviderRequest } from "../providers/provider.js";
import type { RoutingStrategy } from "../router/routing-strategy.js";

const responsesRequestSchema = z
  .object({
    model: z.enum(["router/auto", "router/luna", "router/sol"]).default("router/auto"),
    input: z.unknown(),
    stream: z.boolean().optional(),
  })
  .passthrough();

export type ResponsesProxyDeps = {
  providers: {
    luna: Provider;
    sol: Provider;
  };
  routingStrategy: RoutingStrategy;
};

export function registerResponsesProxy(app: FastifyInstance, deps: ResponsesProxyDeps): void {
  app.post("/v1/responses", async (request, reply) => {
    const parsed = responsesRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { message: "Invalid Responses API request" } });
    }

    const body = parsed.data;

    if (body.stream) {
      return reply.code(501).send({ error: { message: "Streaming is not implemented yet" } });
    }

    const decision = deps.routingStrategy.route({ model: body.model, input: body.input });
    request.log.info({ routing: decision }, "SwitchLM routing decision");

    return deps.providers[decision.target].createResponse(body as ProviderRequest);
  });
}
