export type ProviderRequest = Record<string, unknown>;

export interface Provider {
  createResponse(request: ProviderRequest): Promise<unknown>;
  createResponseStream?(request: ProviderRequest): Promise<Response>;
}
