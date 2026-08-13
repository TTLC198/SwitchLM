import type { Provider, ProviderRequest } from "./provider.js";

export type OpenAICompatibleProviderConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export class OpenAICompatibleProvider implements Provider {
  constructor(private readonly config: OpenAICompatibleProviderConfig) {}

  async createResponse(request: ProviderRequest): Promise<unknown> {
    const response = await fetch(joinUrl(this.config.baseUrl, "responses"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({ ...request, model: this.config.model }),
    });

    if (!response.ok) {
      throw new Error(`Provider request failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
