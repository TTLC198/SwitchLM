#!/usr/bin/env node

import { ChatGptOAuth, type ChatGptOAuthConfig } from "./auth/chatgpt-oauth.js";
import { unstableChatGptOAuthDefaults } from "./auth/chatgpt-oauth-defaults.js";
import { TokenStore } from "./auth/token-store.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { startServer } from "./server.js";
import type { TokenStatsSnapshot } from "./telemetry/token-stats.js";

export type CliCommand = "start" | "status" | "stats" | "login chatgpt" | "logout chatgpt" | "auth status";

export function parseCommand(args: string[]): CliCommand | undefined {
  const command = args.slice(0, 2).join(" ");

  if (command === "login chatgpt" || command === "logout chatgpt" || command === "auth status") {
    return command;
  }

  return args[0] === "start" || args[0] === "status" || args[0] === "stats" ? args[0] : undefined;
}

function serverUrl(config: Pick<AppConfig, "host" | "port">, path: string): string {
  const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  return "http://" + host + ":" + config.port + path;
}

export function healthUrl(config: Pick<AppConfig, "host" | "port">): string {
  return serverUrl(config, "/health");
}

export async function fetchStats(config: AppConfig): Promise<TokenStatsSnapshot> {
  const response = await fetch(serverUrl(config, "/stats"));

  if (!response.ok) {
    throw new Error("SwitchLM stats request failed: " + response.status);
  }

  return response.json() as Promise<TokenStatsSnapshot>;
}

export function statsTable(stats: TokenStatsSnapshot) {
  return Object.fromEntries(
    Object.entries({ luna: stats.models.luna, sol: stats.models.sol, total: stats.total }).map(([model, entry]) => [
      model,
      {
        routed: entry.routedRequests,
        measured: entry.measuredResponses,
        missing: entry.routedRequests - entry.measuredResponses,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.totalTokens,
      },
    ]),
  );
}

export async function runStatus(config: AppConfig): Promise<boolean> {
  try {
    const response = await fetch(healthUrl(config));
    return response.ok;
  } catch {
    return false;
  }
}

export function chatGptOAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ChatGptOAuthConfig {
  return {
    authorizeUrl: env.SWITCHLM_CHATGPT_AUTHORIZE_URL ?? unstableChatGptOAuthDefaults.authorizeUrl,
    tokenUrl: env.SWITCHLM_CHATGPT_TOKEN_URL ?? unstableChatGptOAuthDefaults.tokenUrl,
    clientId: env.SWITCHLM_CHATGPT_CLIENT_ID ?? unstableChatGptOAuthDefaults.clientId,
    scopes: env.SWITCHLM_CHATGPT_SCOPES?.split(/\s+/).filter(Boolean) ?? unstableChatGptOAuthDefaults.scopes,
    callbackHost: unstableChatGptOAuthDefaults.callbackHost,
    callbackPort: unstableChatGptOAuthDefaults.callbackPort,
    callbackPath: unstableChatGptOAuthDefaults.callbackPath,
    extraParams: unstableChatGptOAuthDefaults.extraParams,
  };
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv.slice(2));

  if (!command) {
    console.error("Usage: switchlm <start|status|stats|login chatgpt|logout chatgpt|auth status>");
    process.exitCode = 1;
    return;
  }

  if (command === "start") {
    const config = await loadConfig();
    const address = await startServer(config);
    console.log(`SwitchLM listening at ${address}`);
    return;
  }

  if (command === "status") {
    const ok = await runStatus(await loadConfig());
    console.log(ok ? "SwitchLM is healthy" : "SwitchLM is not healthy");
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (command === "stats") {
    const stats = await fetchStats(await loadConfig());
    console.table(statsTable(stats));
    return;
  }

  const tokenStore = new TokenStore();

  if (command === "login chatgpt") {
    await new ChatGptOAuth(chatGptOAuthConfigFromEnv(), tokenStore).login();
    console.log("ChatGPT login saved");
    return;
  }

  if (command === "logout chatgpt") {
    await tokenStore.deleteChatGptTokens();
    console.log("ChatGPT login removed");
    return;
  }

  const loggedIn = Boolean(await tokenStore.getChatGptTokens());
  console.log(loggedIn ? "ChatGPT account is logged in" : "ChatGPT account is not logged in");
  process.exitCode = loggedIn ? 0 : 1;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
