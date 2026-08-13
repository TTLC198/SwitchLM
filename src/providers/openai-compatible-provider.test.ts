import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

describe("OpenAICompatibleProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /responses with the configured model and bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resp_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://luna.example.test/v1/",
      model: "luna-code",
      apiKey: "secret",
    });

    await expect(provider.createResponse({ model: "router/luna", input: "fix typo" })).resolves.toEqual({
      id: "resp_1",
    });

    expect(fetchMock).toHaveBeenCalledWith("https://luna.example.test/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ model: "luna-code", input: "fix typo" }),
    });
  });

  it("throws provider errors with status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "missing key",
      }),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://sol.example.test/v1",
      model: "sol-reasoning",
    });

    await expect(provider.createResponse({ input: "debug" })).rejects.toThrow(
      "Provider request failed: 401 missing key",
    );
  });

  it("streams from /responses with the configured model", async () => {
    const upstream = new Response("event: response.completed\n\n");
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://luna.example.test/v1/",
      model: "luna-code",
      apiKey: "secret",
    });

    await expect(provider.createResponseStream({ model: "router/luna", input: "fix typo", stream: true })).resolves.toBe(
      upstream,
    );

    expect(fetchMock).toHaveBeenCalledWith("https://luna.example.test/v1/responses", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ model: "luna-code", input: "fix typo", stream: true }),
    });
  });
});
