import { describe, expect, it, vi } from "vitest";
import type { TokenStore } from "../auth/token-store.js";
import type { CodexResponsesTransport } from "../transport/codex-responses-transport.js";
import { CodexChatGptProvider } from "./codex-chatgpt-provider.js";

describe("CodexChatGptProvider", () => {
  it("uses stored tokens and replaces the request model", async () => {
    const tokenStore = fakeTokenStore({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 120_000 });
    const transport = fakeTransport({ id: "resp_1" });

    await expect(
      new CodexChatGptProvider({ model: "gpt-codex", account: "default" }, tokenStore, transport).createResponse({
        model: "router/sol",
        input: "debug this",
      }),
    ).resolves.toEqual({ id: "resp_1" });

    expect(transport.createResponse).toHaveBeenCalledWith("access", {
      model: "gpt-codex",
      input: "debug this",
    });
  });

  it("refreshes expired tokens before sending the request", async () => {
    const tokenStore = fakeTokenStore({ accessToken: "old", refreshToken: "refresh", expiresAt: Date.now() - 1 });
    const transport = fakeTransport({ id: "resp_1" });
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: "new",
      refreshToken: "new-refresh",
      expiresAt: Date.now() + 120_000,
    });

    await new CodexChatGptProvider({ model: "gpt-codex" }, tokenStore, transport, refreshTokens).createResponse({
      input: "hello",
    });

    expect(refreshTokens).toHaveBeenCalledWith("refresh");
    expect(tokenStore.saveChatGptTokens).toHaveBeenCalledWith("default", expect.objectContaining({ accessToken: "new" }));
    expect(transport.createResponse).toHaveBeenCalledWith("new", { input: "hello", model: "gpt-codex" });
  });

  it("surfaces missing login as an actionable error", async () => {
    const tokenStore = {
      requireChatGptTokens: vi.fn().mockRejectedValue(new Error("ChatGPT account is not logged in: default. Run: switchlm login chatgpt")),
    } as unknown as TokenStore;

    await expect(
      new CodexChatGptProvider({ model: "gpt-codex" }, tokenStore, fakeTransport({})).createResponse({ input: "hello" }),
    ).rejects.toThrow("Run: switchlm login chatgpt");
  });
});

function fakeTokenStore(tokens: { accessToken: string; refreshToken: string; expiresAt: number }): TokenStore {
  return {
    requireChatGptTokens: vi.fn().mockResolvedValue(tokens),
    saveChatGptTokens: vi.fn().mockResolvedValue(undefined),
  } as unknown as TokenStore;
}

function fakeTransport(response: unknown): CodexResponsesTransport {
  return {
    createResponse: vi.fn().mockResolvedValue(response),
    createResponseStream: vi.fn().mockResolvedValue(new Response()),
  };
}
