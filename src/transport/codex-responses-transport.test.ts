import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpCodexResponsesTransport } from "./codex-responses-transport.js";

describe("HttpCodexResponsesTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts Responses API requests with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "resp_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new HttpCodexResponsesTransport("https://example.test/codex/responses").createResponse("access", {
        model: "gpt-codex",
        input: "hello",
      }),
    ).resolves.toEqual({ id: "resp_1" });

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/codex/responses", {
      method: "POST",
      headers: {
        authorization: "Bearer access",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-codex", input: "hello" }),
    });
  });

  it("throws transport errors with status and body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      }),
    );

    await expect(
      new HttpCodexResponsesTransport("https://example.test/codex/responses").createResponse("access", {}),
    ).rejects.toThrow("Codex transport request failed: 403 forbidden");
  });

  it("posts streaming requests with SSE accept header", async () => {
    const upstream = new Response("event: response.completed\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new HttpCodexResponsesTransport("https://example.test/codex/responses").createResponseStream("access", {
        model: "gpt-codex",
        input: "hello",
        stream: true,
      }),
    ).resolves.toBe(upstream);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/codex/responses", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: "Bearer access",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-codex", input: "hello", stream: true }),
    });
  });
});
