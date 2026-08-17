import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "./config.js";
import { chatGptOAuthConfigFromEnv, fetchStats, healthUrl, parseCommand, statsTable } from "./cli.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseCommand", () => {
  it("accepts MVP command names", () => {
    expect(parseCommand(["start"])).toBe("start");
    expect(parseCommand(["status"])).toBe("status");
    expect(parseCommand(["stats"])).toBe("stats");
    expect(parseCommand(["login", "chatgpt"])).toBe("login chatgpt");
    expect(parseCommand(["logout", "chatgpt"])).toBe("logout chatgpt");
    expect(parseCommand(["auth", "status"])).toBe("auth status");
  });

  it("rejects unknown commands", () => {
    expect(parseCommand(["install"])).toBeUndefined();
  });

  it("builds the health URL from config", () => {
    expect(healthUrl({ host: "127.0.0.1", port: 8787 })).toBe("http://127.0.0.1:8787/health");
    expect(healthUrl({ host: "0.0.0.0", port: 8787 })).toBe("http://127.0.0.1:8787/health");
  });

  it("fetches token statistics from the local server", async () => {
    const stats = {
      total: { routedRequests: 1, measuredResponses: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      models: {
        luna: { routedRequests: 1, measuredResponses: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        sol: { routedRequests: 0, measuredResponses: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
      shadow: { comparisons: 0, disagreements: 0, shadowErrors: 0, primarySolRequests: 0, shadowSolRequests: 0, latencyMsTotal: 0 },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(stats)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchStats({ host: "0.0.0.0", port: 8787 } as AppConfig)).resolves.toEqual(stats);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/stats");
  });

  it("formats routed and missing responses for display", () => {
    expect(
      statsTable({
        total: { routedRequests: 3, measuredResponses: 2, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        models: {
          luna: { routedRequests: 2, measuredResponses: 1, inputTokens: 4, outputTokens: 2, totalTokens: 6 },
          sol: { routedRequests: 1, measuredResponses: 1, inputTokens: 6, outputTokens: 3, totalTokens: 9 },
        },
        shadow: { comparisons: 0, disagreements: 0, shadowErrors: 0, primarySolRequests: 0, shadowSolRequests: 0, latencyMsTotal: 0 },
      }),
    ).toEqual({
      luna: { routed: 2, measured: 1, missing: 1, inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      sol: { routed: 1, measured: 1, missing: 0, inputTokens: 6, outputTokens: 3, totalTokens: 9 },
      total: { routed: 3, measured: 2, missing: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it("reads ChatGPT OAuth config from env", () => {
    expect(
      chatGptOAuthConfigFromEnv({
        SWITCHLM_CHATGPT_AUTHORIZE_URL: "https://example.test/auth",
        SWITCHLM_CHATGPT_TOKEN_URL: "https://example.test/token",
        SWITCHLM_CHATGPT_CLIENT_ID: "client",
        SWITCHLM_CHATGPT_SCOPES: "openid profile",
      }),
    ).toEqual({
      authorizeUrl: "https://example.test/auth",
      tokenUrl: "https://example.test/token",
      clientId: "client",
      scopes: ["openid", "profile"],
      callbackHost: "localhost",
      callbackPort: 1455,
      callbackPath: "/auth/callback",
      extraParams: {
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "codex_cli_rs",
        prompt: "login",
      },
    });
  });
});
