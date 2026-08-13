import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { TokenStore } from "./token-store.js";

describe("TokenStore", () => {
  it("saves and loads ChatGPT tokens", async () => {
    const path = await tempAuthPath();
    const store = new TokenStore(path);

    await store.saveChatGptTokens("default", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
    });

    await expect(store.getChatGptTokens("default")).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
    });
    await expect(readFile(path, "utf8")).resolves.toContain("\"chatgpt\"");
  });

  it("throws an actionable error for missing ChatGPT accounts", async () => {
    const store = new TokenStore(await tempAuthPath());

    await expect(store.requireChatGptTokens("default")).rejects.toThrow(
      "ChatGPT account is not logged in: default. Run: switchlm login chatgpt",
    );
  });

  it("deletes ChatGPT tokens", async () => {
    const store = new TokenStore(await tempAuthPath());
    await store.saveChatGptTokens("default", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
    });

    await store.deleteChatGptTokens("default");

    await expect(store.getChatGptTokens("default")).resolves.toBeUndefined();
  });
});

async function tempAuthPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "switchlm-auth-")), "auth.json");
}
