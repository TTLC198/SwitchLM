import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../providers/provider.js";
import type { RoutingStrategy } from "../router/routing-strategy.js";
import { registerResponsesProxy } from "./responses-proxy.js";

describe("registerResponsesProxy", () => {
  it("routes non-streaming responses to the selected provider", async () => {
    const luna: Provider = { createResponse: vi.fn().mockResolvedValue({ id: "luna_resp" }) };
    const sol: Provider = { createResponse: vi.fn().mockResolvedValue({ id: "sol_resp" }) };
    const routingStrategy: RoutingStrategy = {
      route: vi.fn().mockReturnValue({ target: "sol", score: 5, reasons: ["race condition"] }),
    };
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, { providers: { luna, sol }, routingStrategy });

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

  it("rejects unsupported virtual models", async () => {
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn() },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "gpt-5", input: "hello" },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it("returns 501 for streaming until SSE proxying is implemented", async () => {
    const app = Fastify({ logger: false });
    registerResponsesProxy(app, {
      providers: {
        luna: { createResponse: vi.fn() },
        sol: { createResponse: vi.fn() },
      },
      routingStrategy: { route: vi.fn() },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/responses",
      payload: { model: "router/auto", input: "hello", stream: true },
    });
    await app.close();

    expect(response.statusCode).toBe(501);
  });
});
