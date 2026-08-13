import type { ChatGptTokens, TokenStore } from "../auth/token-store.js";
import type { CodexResponsesTransport } from "../transport/codex-responses-transport.js";
import type { Provider, ProviderRequest } from "./provider.js";

export type CodexChatGptProviderConfig = {
  model: string;
  account?: string;
};

export class CodexChatGptProvider implements Provider {
  constructor(
    private readonly config: CodexChatGptProviderConfig,
    private readonly tokenStore: TokenStore,
    private readonly transport: CodexResponsesTransport,
    private readonly refreshTokens?: (refreshToken: string) => Promise<ChatGptTokens>,
  ) {}

  async createResponse(request: ProviderRequest): Promise<unknown> {
    const account = this.config.account ?? "default";
    const tokens = await this.validTokens(account);

    return this.transport.createResponse(tokens.accessToken, {
      ...request,
      model: this.config.model,
    });
  }

  async createResponseStream(request: ProviderRequest): Promise<Response> {
    const account = this.config.account ?? "default";
    const tokens = await this.validTokens(account);

    return this.transport.createResponseStream(tokens.accessToken, {
      ...request,
      model: this.config.model,
    });
  }

  private async validTokens(account: string): Promise<ChatGptTokens> {
    const tokens = await this.tokenStore.requireChatGptTokens(account);

    if (tokens.expiresAt >= Date.now() + 60_000) {
      return tokens;
    }

    if (!this.refreshTokens || !tokens.refreshToken) {
      throw new Error(`ChatGPT login expired. Run: switchlm login chatgpt`);
    }

    const refreshed = await this.refreshTokens(tokens.refreshToken);
    await this.tokenStore.saveChatGptTokens(account, refreshed);
    return refreshed;
  }
}
