import Fastify from "fastify";
import type { AppConfig, ProviderConfig } from "./config.js";
import type { Provider } from "./providers/provider.js";
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
      luna: createProvider(config.providers.luna),
      sol: createProvider(config.providers.sol),
    },
    routingStrategy: new HeuristicRoutingStrategy(config.routing.solThreshold),
  });

  return app;
}

function createProvider(config: ProviderConfig): Provider {
  if (config.type !== "openai-compatible") {
    throw new Error(`Provider type is not implemented yet: ${config.type}`);
  }

  return new OpenAICompatibleProvider(config);
}

export async function startServer(config: AppConfig): Promise<string> {
  const app = buildApp(config);
  return app.listen({ host: config.host, port: config.port });
}
