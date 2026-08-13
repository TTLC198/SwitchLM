import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { registerResponsesProxy } from "./proxy/responses-proxy.js";
import { HeuristicRoutingStrategy } from "./router/heuristic-strategy.js";

export function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: { level: config.logLevel },
  });

  app.get("/health", async () => ({
    status: "ok",
    name: "SwitchLM",
  }));

  registerResponsesProxy(app, {
    providers: {
      luna: new OpenAICompatibleProvider(config.providers.luna),
      sol: new OpenAICompatibleProvider(config.providers.sol),
    },
    routingStrategy: new HeuristicRoutingStrategy(config.routing.solThreshold),
  });

  return app;
}

export async function startServer(config: AppConfig): Promise<string> {
  const app = buildApp(config);
  return app.listen({ host: config.host, port: config.port });
}
