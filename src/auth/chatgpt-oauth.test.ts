import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatGptOAuth } from "./chatgpt-oauth.js";
import { pkceChallenge } from "./oauth-pkce.js";

const config = {
  authorizeUrl: "https://example.test/oauth/authorize",
  tokenUrl: "https://example.test/oauth/token",
  clientId: "switchlm-client",
  scopes: ["openid", "profile"],
};

describe("ChatGptOAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an OAuth authorization URL with PKCE", () => {
    const oauth = new ChatGptOAuth(config);
    const url = new URL(oauth.authorizationUrl("http://127.0.0.1:8787/callback", "verifier", "state"));

    expect(url.origin + url.pathname).toBe("https://example.test/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("switchlm-client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:8787/callback");
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge("verifier"));
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe("openid profile");
  });

  it("exchanges an authorization code for tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "access", refresh_token: "refresh", expires_in: 60 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await new ChatGptOAuth(config).exchangeCode("code", "http://callback", "verifier");

    expect(tokens.accessToken).toBe("access");
    expect(tokens.refreshToken).toBe("refresh");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "switchlm-client",
        code: "code",
        redirect_uri: "http://callback",
        code_verifier: "verifier",
      }),
    });
  });

  it("refreshes tokens and keeps the existing refresh token when none is returned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "new-access", expires_in: 60 }),
      }),
    );

    await expect(new ChatGptOAuth(config).refreshTokens("old-refresh")).resolves.toMatchObject({
      accessToken: "new-access",
      refreshToken: "old-refresh",
    });
  });
});
