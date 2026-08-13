import { describe, expect, it } from "vitest";
import { HeuristicRoutingStrategy } from "./heuristic-strategy.js";

describe("HeuristicRoutingStrategy", () => {
  it("routes simple coding tasks to Luna", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Rename this variable and fix the typo.",
    });

    expect(decision.target).toBe("luna");
    expect(decision.score).toBe(0);
  });

  it("routes complex architecture and concurrency tasks to Sol", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Do an architecture redesign and investigate a race condition across multiple modules.",
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toContain("architecture");
    expect(decision.reasons).toContain("race condition");
  });

  it("honors manual virtual models", () => {
    const strategy = new HeuristicRoutingStrategy();

    expect(strategy.route({ model: "router/luna", input: "security audit" }).target).toBe("luna");
    expect(strategy.route({ model: "router/sol", input: "typo" }).target).toBe("sol");
  });
});
