import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "./config.js";
import { buildApp } from "./server.js";

const config = parseConfig({
  logLevel: "fatal",
  providers: {
    luna: {
      baseUrl: "https://luna.example.test/v1",
      model: "luna-code",
      apiKeyEnv: "LUNA_API_KEY",
    },
    sol: {
      baseUrl: "https://sol.example.test/v1",
      model: "sol-reasoning",
      apiKeyEnv: "SOL_API_KEY",
    },
  },
});

describe("buildApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves health", async () => {
    const app = buildApp(config);

    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", name: "SwitchLM" });
  });

  it("serves token statistics", async () => {
    const app = buildApp(config);

    const response = await app.inject({ method: "GET", url: "/stats" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      total: { routedRequests: 0, measuredResponses: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      models: {
        luna: { routedRequests: 0, measuredResponses: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        sol: { routedRequests: 0, measuredResponses: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
      shadow: {
        comparisons: 0,
        disagreements: 0,
        shadowErrors: 0,
        primarySolRequests: 0,
        shadowSolRequests: 0,
        latencyMsTotal: 0,
        disagreementRate: 0,
        shadowSolRate: 0,
        averageLatencyMs: 0,
      },
    });
  });

  it("keeps heuristic provider selection in shadow mode and skips manual shadowing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "response-1" })));
    vi.stubGlobal("fetch", fetchMock);
    const app = buildApp(parseConfig({ ...config, routing: { mode: "shadow", shadowSampling: 1 } }));

    await app.inject({ method: "POST", url: "/v1/responses", payload: { model: "router/auto", input: "Rename this variable." } });
    await app.inject({ method: "POST", url: "/v1/responses", payload: { model: "router/luna", input: "Investigate this race condition." } });
    const stats = await app.inject({ method: "GET", url: "/stats" });
    await app.close();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://luna.example.test/v1/responses", expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://luna.example.test/v1/responses", expect.anything());
    expect(stats.json().shadow.comparisons).toBe(1);
  });
  it("accepts Responses API requests larger than Fastify's default limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "response-1" })));
    vi.stubGlobal("fetch", fetchMock);
    const app = buildApp(config);

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/luna", input: "x".repeat(1024 * 1024 + 1) },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
  });

  it("wires ChatGPT Codex providers", () => {
    const app = buildApp(
      parseConfig({
        logLevel: "fatal",
        providers: {
          luna: config.providers.luna,
          sol: {
            type: "codex-chatgpt",
            responsesUrl: "https://chatgpt.example.test/backend-api/codex/responses",
            model: "gpt-5.6-sol",
          },
        },
      }),
    );

    expect(app.hasRoute({ method: "POST", url: "/v1/responses" })).toBe(true);
  });

  it("streams Responses API requests through provider wiring", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("event: response.completed\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = buildApp(config);

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/luna", input: "hello", stream: true },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toBe("event: response.completed\n\n");
    expect(fetchMock).toHaveBeenCalledWith("https://luna.example.test/v1/responses", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: "luna-code", input: "hello", stream: true }),
    });
  });
});


