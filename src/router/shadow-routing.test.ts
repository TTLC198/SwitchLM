import { describe, expect, it, vi } from "vitest";
import { HeuristicRoutingStrategy } from "./heuristic-strategy.js";
import { ShadowRoutingStrategy } from "./shadow-routing.js";

describe("ShadowRoutingStrategy", () => {
  it("returns primary decisions and observes shadow comparisons", () => {
    const observe = vi.fn();
    const strategy = new ShadowRoutingStrategy(
      new HeuristicRoutingStrategy(),
      { route: () => ({ target: "sol", score: 1, reasons: ["shadow"] }) },
      observe,
    );

    const decision = strategy.route({ model: "router/auto", input: "Rename this variable." });

    expect(decision.target).toBe("luna");
    expect(observe).toHaveBeenCalledWith({
      primary: expect.objectContaining({ target: "luna" }),
      shadow: { target: "sol", score: 1, reasons: ["shadow"] },
      latencyMs: expect.any(Number),
    });
  });

  it("does not let a shadow failure affect the primary decision", () => {
    const observe = vi.fn();
    const strategy = new ShadowRoutingStrategy(
      new HeuristicRoutingStrategy(),
      { route: () => { throw new Error("shadow failed"); } },
      observe,
    );

    expect(strategy.route({ model: "router/auto", input: "Investigate this race condition." }).target).toBe("sol");
    expect(observe).toHaveBeenCalledWith({
      primary: expect.objectContaining({ target: "sol" }),
      latencyMs: expect.any(Number),
    });
  });
});