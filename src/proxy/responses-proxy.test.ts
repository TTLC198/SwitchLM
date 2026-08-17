import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers/provider.js";
import type { RoutingStrategy } from "../router/routing-strategy.js";
import { TokenStats } from "../telemetry/token-stats.js";
import { registerResponsesProxy } from "./responses-proxy.js";

describe("registerResponsesProxy", () => {
  it("routes non-streaming responses to the selected provider", async () => {
    const luna: Provider = { createResponse: vi.fn().mockResolvedValue({ id: "luna_resp" }) };
    const sol: Provider = { createResponse: vi.fn().mockResolvedValue({ id: "sol_resp" }) };
    const routingStrategy: RoutingStrategy = {
      route: vi.fn().mockReturnValue({ target: "sol", score: 5, reasons: ["race condition"] }),
    };
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, { providers: { luna, sol }, routingStrategy, tokenStats: new TokenStats() });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/auto", input: "race condition", temperature: 0 },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "sol_resp" });
    expect(routingStrategy.route).toHaveBeenCalledWith({ model: "router/auto", input: "race condition" });
    expect(sol.createResponse).toHaveBeenCalledWith({
      model: "router/auto",
      input: "race condition",
      temperature: 0,
    });
    expect(luna.createResponse).not.toHaveBeenCalled();
  });

  it("schedules runtime observation without waiting for the observer", async () => {
    const observer = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    });
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol: { createResponse: vi.fn().mockResolvedValue({ id: "sol_resp" }) },
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "sol", score: 5, reasons: ["race condition"] }) },
      tokenStats: new TokenStats(),
      trainingObserver: observer,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/auto", input: "race condition" },
    });
    expect(response.statusCode).toBe(200);
    expect(observer).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rejects unsupported virtual models", async () => {
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn() },
      tokenStats: new TokenStats(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-5", input: "hello" },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it("streams responses from the selected provider", async () => {
    const stream = new Response("event: response.completed\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
    const sol: Provider = {
      createResponse: vi.fn(),
      createResponseStream: vi.fn().mockResolvedValue(stream),
    };
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol,
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "sol", score: 1, reasons: ["manual sol"] }) },
      tokenStats: new TokenStats(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/auto", input: "hello", stream: true },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toBe("event: response.completed\n\n");
    expect(sol.createResponseStream).toHaveBeenCalledWith({ model: "router/auto", input: "hello", stream: true });
  });

  it("records usage from a chunked completed stream without changing it", async () => {
    const tokenStats = new TokenStats();
    const encoder = new TextEncoder();
    const chunks = [
      'event: response.completed\ndata: {"response":{"usage":{"input_tokens":10,',
      '"output_tokens":5,"total_tokens":15}}}\n\n',
    ];
    const stream = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol: { createResponse: vi.fn(), createResponseStream: vi.fn().mockResolvedValue(stream) },
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "sol", score: 1, reasons: [] }) },
      tokenStats,
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/sol", input: "hello", stream: true },
    });
    await app.close();

    expect(response.body).toBe(chunks.join(""));
    expect(tokenStats.snapshot().models.sol).toEqual({
      routedRequests: 1,
      measuredResponses: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("ignores an incomplete completed event", async () => {
    const tokenStats = new TokenStats();
    const stream = new Response(
      'event: response.completed\ndata: {"response":{"usage":{"input_tokens":10',
      { headers: { "content-type": "text/event-stream" } },
    );
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn(), createResponseStream: vi.fn().mockResolvedValue(stream) },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "luna", score: 0, reasons: [] }) },
      tokenStats,
    });

    await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/luna", input: "hello", stream: true },
    });
    await app.close();

    expect(tokenStats.snapshot().total).toMatchObject({ routedRequests: 1, measuredResponses: 0 });
  });

  it("records valid usage from non-streaming responses", async () => {
    const tokenStats = new TokenStats();
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: {
          createResponse: vi.fn().mockResolvedValue({
            id: "response-1",
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          }),
        },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "luna", score: 0, reasons: [] }) },
      tokenStats,
    });

    await app.inject({ method: "POST", url: "/v1/responses", payload: { input: "hello" } });
    await app.close();

    expect(tokenStats.snapshot().models.luna).toEqual({
      routedRequests: 1,
      measuredResponses: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("ignores invalid usage from non-streaming responses", async () => {
    const tokenStats = new TokenStats();
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: {
          createResponse: vi.fn().mockResolvedValue({
            usage: { input_tokens: 10, output_tokens: -1, total_tokens: 9 },
          }),
        },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn().mockReturnValue({ target: "luna", score: 0, reasons: [] }) },
      tokenStats,
    });

    await app.inject({ method: "POST", url: "/v1/responses", payload: { input: "hello" } });
    await app.close();

    expect(tokenStats.snapshot().total).toMatchObject({ routedRequests: 1, measuredResponses: 0 });
  });
});
