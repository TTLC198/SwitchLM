import { createServer } from "node:http";
import { createPkcePair, pkceChallenge } from "./oauth-pkce.js";
import type { ChatGptTokens } from "./token-store.js";
import { TokenStore } from "./token-store.js";

export type ChatGptOAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes?: string[];
  callbackHost?: string;
  callbackPort?: number;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export class ChatGptOAuth {
  constructor(
    private readonly config: ChatGptOAuthConfig,
    private readonly tokenStore = new TokenStore(),
  ) {}

  authorizationUrl(redirectUri: string, verifier: string, state: string): string {
    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", pkceChallenge(verifier));
    url.searchParams.set("state", state);

    if (this.config.scopes?.length) {
      url.searchParams.set("scope", this.config.scopes.join(" "));
    }

    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string, verifier: string): Promise<ChatGptTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });

    return parseTokenResponse(response);
  }

  async refreshTokens(refreshToken: string): Promise<ChatGptTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        refresh_token: refreshToken,
      }),
    });

    return parseTokenResponse(response, refreshToken);
  }

  async login(account = "default"): Promise<string> {
    const pair = createPkcePair();
    const state = createPkcePair().verifier;
    const { redirectUri, waitForCode, close } = await listenForOAuthCode(
      this.config.callbackHost ?? "127.0.0.1",
      this.config.callbackPort ?? 0,
      state,
    );

    try {
      const authorizationUrl = this.authorizationUrl(redirectUri, pair.verifier, state);
      console.log(`Open this URL to log in:\n${authorizationUrl}`);
      const code = await waitForCode;
      await this.tokenStore.saveChatGptTokens(account, await this.exchangeCode(code, redirectUri, pair.verifier));
      return account;
    } finally {
      await close();
    }
  }
}

async function parseTokenResponse(response: Response, fallbackRefreshToken?: string): Promise<ChatGptTokens> {
  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;

  if (!data.access_token) {
    throw new Error("OAuth token response did not include access_token");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? fallbackRefreshToken ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function listenForOAuthCode(host: string, port: number, state: string) {
  let resolveCode: (code: string) => void;
  let rejectCode: (error: Error) => void;
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    const code = url.searchParams.get("code");
    const receivedState = url.searchParams.get("state");

    if (!code || receivedState !== state) {
      response.writeHead(400);
      response.end("Invalid OAuth callback");
      rejectCode(new Error("Invalid OAuth callback"));
      return;
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end("SwitchLM login complete. You can close this tab.");
    resolveCode(code);
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("OAuth callback server did not start");
  }

  return {
    redirectUri: `http://${host}:${address.port}/callback`,
    waitForCode,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
