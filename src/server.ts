import Fastify from "fastify";
import { ChatGptOAuth } from "./auth/chatgpt-oauth.js";
import { unstableChatGptOAuthDefaults } from "./auth/chatgpt-oauth-defaults.js";
import { TokenStore } from "./auth/token-store.js";
import type { AppConfig, ProviderConfig } from "./config.js";
import { CodexChatGptProvider } from "./providers/codex-chatgpt-provider.js";
import type { Provider } from "./providers/provider.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible-provider.js";
import { registerResponsesProxy } from "./proxy/responses-proxy.js";
import { HeuristicRoutingStrategy } from "./router/heuristic-strategy.js";
import { HttpCodexResponsesTransport } from "./transport/codex-responses-transport.js";

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
  if (config.type === "openai-compatible") {
    return new OpenAICompatibleProvider(config);
  }

  const oauth = chatGptOAuthFromEnv();

  return new CodexChatGptProvider(
    config,
    new TokenStore(),
    new HttpCodexResponsesTransport(config.responsesUrl),
    oauth ? (refreshToken) => oauth.refreshTokens(refreshToken) : undefined,
  );
}

function chatGptOAuthFromEnv(): ChatGptOAuth | undefined {
  return new ChatGptOAuth({
    authorizeUrl: process.env.SWITCHLM_CHATGPT_AUTHORIZE_URL ?? unstableChatGptOAuthDefaults.authorizeUrl,
    tokenUrl: process.env.SWITCHLM_CHATGPT_TOKEN_URL ?? unstableChatGptOAuthDefaults.tokenUrl,
    clientId: process.env.SWITCHLM_CHATGPT_CLIENT_ID ?? unstableChatGptOAuthDefaults.clientId,
    scopes: process.env.SWITCHLM_CHATGPT_SCOPES?.split(/\s+/).filter(Boolean) ?? unstableChatGptOAuthDefaults.scopes,
    extraParams: unstableChatGptOAuthDefaults.extraParams,
  });
}

export async function startServer(config: AppConfig): Promise<string> {
  const app = buildApp(config);
  return app.listen({ host: config.host, port: config.port });
}
