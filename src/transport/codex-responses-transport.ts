import type { ProviderRequest } from "../providers/provider.js";

export interface CodexResponsesTransport {
  createResponse(accessToken: string, request: ProviderRequest): Promise<unknown>;
  createResponseStream(accessToken: string, request: ProviderRequest): Promise<Response>;
}

export class HttpCodexResponsesTransport implements CodexResponsesTransport {
  constructor(private readonly responsesUrl: string) {}

  async createResponse(accessToken: string, request: ProviderRequest): Promise<unknown> {
    const response = await fetch(this.responsesUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Codex transport request failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  async createResponseStream(accessToken: string, request: ProviderRequest): Promise<Response> {
    const response = await fetch(this.responsesUrl, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Codex transport request failed: ${response.status} ${await response.text()}`);
    }

    return response;
  }
}
