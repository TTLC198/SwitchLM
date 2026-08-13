import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { z } from "zod";
import type { Provider, ProviderRequest } from "../providers/provider.js";
import type { RoutingStrategy } from "../router/routing-strategy.js";
import type { TokenStats, TokenUsage } from "../telemetry/token-stats.js";

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
  tokenStats: TokenStats;
};

export function registerResponsesProxy(app: FastifyInstance, deps: ResponsesProxyDeps): void {
  app.post("/v1/responses", async (request, reply) => {
    const parsed = responsesRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: { message: "Invalid Responses API request" } });
    }

    const body = parsed.data;
    const decision = deps.routingStrategy.route({ model: body.model, input: body.input });
    request.log.info({ routing: decision }, "SwitchLM routing decision");

    if (body.stream) {
      const provider = deps.providers[decision.target];

      if (!provider.createResponseStream) {
        return reply.code(501).send({ error: { message: "Selected provider does not support streaming" } });
      }

      const upstream = await provider.createResponseStream(body as ProviderRequest);
      reply.code(upstream.status);
      reply.header("content-type", upstream.headers.get("content-type") ?? "text/event-stream");
      reply.header("cache-control", upstream.headers.get("cache-control") ?? "no-cache");

      if (!upstream.body) {
        return reply.send();
      }

      return reply.send(Readable.fromWeb(upstream.body as unknown as NodeReadableStream<Uint8Array>));
    }

    const response = await deps.providers[decision.target].createResponse(body as ProviderRequest);
    const usage = parseUsage(response);

    if (usage) {
      deps.tokenStats.record(decision.target, usage);
      request.log.info({ model: decision.target, usage }, "SwitchLM token usage");
    }

    return response;
  });
}

function parseUsage(response: unknown): TokenUsage | undefined {
  if (!response || typeof response !== "object" || !("usage" in response)) {
    return undefined;
  }

  const usage = response.usage;

  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const inputTokens = "input_tokens" in usage ? usage.input_tokens : undefined;
  const outputTokens = "output_tokens" in usage ? usage.output_tokens : undefined;
  const totalTokens = "total_tokens" in usage ? usage.total_tokens : undefined;

  if (![inputTokens, outputTokens, totalTokens].every((value) => Number.isSafeInteger(value) && Number(value) >= 0)) {
    return undefined;
  }

  return {
    inputTokens: Number(inputTokens),
    outputTokens: Number(outputTokens),
    totalTokens: Number(totalTokens),
  };
}
