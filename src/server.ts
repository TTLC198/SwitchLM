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
import { createLearnedRoutingStrategy } from "./router/learned-strategy.js";
import { ShadowRoutingStrategy } from "./router/shadow-routing.js";
import { TrainingObservationCollector } from "./router/training-observation.js";
import { TrainingRequestCollector } from "./router/training-request.js";
import { TokenStats } from "./telemetry/token-stats.js";
import { HttpCodexResponsesTransport } from "./transport/codex-responses-transport.js";

export function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.bodyLimit,
  });
  const tokenStats = new TokenStats();

  app.get("/health", async () => ({
    status: "ok",
    name: "SwitchLM",
  }));

  app.get("/stats", async () => tokenStats.snapshot());

  registerResponsesProxy(app, {
    providers: {
      luna: createProvider(config.providers.luna),
      sol: createProvider(config.providers.sol),
    },
    routingStrategy: createRoutingStrategy(config, tokenStats),
    tokenStats,
    trainingObserver: createTrainingObserver(config),
    trainingRequestCollector: createTrainingRequestCollector(config),
  });

  return app;
}

function createTrainingRequestCollector(config: AppConfig) {
  const policy = config.routing.trainingData;
  if (!policy.enabled || !policy.capturePrompts) return undefined;

  const collector = new TrainingRequestCollector({
    enabled: true,
    filePath: policy.requestFilePath,
    maxRequestBytes: policy.maxRequestBytes,
    retentionDays: policy.retentionDays,
    hmacKey: process.env[policy.hmacKeyEnv],
  });
  return (request: Parameters<TrainingRequestCollector["record"]>[0]) => collector.record(request);
}

function createTrainingObserver(config: AppConfig) {
  const policy = config.routing.trainingData;
  if (!policy.enabled) return undefined;

  const collector = new TrainingObservationCollector({
    enabled: true,
    filePath: policy.observationFilePath,
    maxRecordBytes: policy.maxRecordBytes,
    minIntervalMs: policy.minIntervalMs,
    retentionDays: policy.retentionDays,
    hmacKey: process.env[policy.hmacKeyEnv],
  });
  return (observation: Parameters<TrainingObservationCollector["record"]>[0]) => collector.record(observation);
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
    callbackHost: unstableChatGptOAuthDefaults.callbackHost,
    callbackPort: unstableChatGptOAuthDefaults.callbackPort,
    callbackPath: unstableChatGptOAuthDefaults.callbackPath,
    extraParams: unstableChatGptOAuthDefaults.extraParams,
  });
}

export async function startServer(config: AppConfig): Promise<string> {
  const app = buildApp(config);
  return app.listen({ host: config.host, port: config.port });
}

function createRoutingStrategy(config: AppConfig, tokenStats: TokenStats) {
  const heuristic = new HeuristicRoutingStrategy(config.routing.solThreshold);
  const learned = createLearnedRoutingStrategy(config.routing.learnedModelPath, config.routing.solThreshold);

  if (config.routing.mode === "learned") {
    return learned;
  }

  if (config.routing.mode === "shadow") {
    return new ShadowRoutingStrategy(heuristic, learned, (comparison) => tokenStats.recordShadowComparison(comparison), {
      sampleRate: config.routing.shadowSampling,
    });
  }

  return heuristic;
}


