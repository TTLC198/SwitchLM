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
    expect(decision.reasons).toEqual(["risk", "architecture", "scope"]);
  });

  it("ignores heavy signals in developer context", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: [
        { role: "developer", content: "Always inspect architecture, concurrency, and security analysis." },
        { role: "user", content: [{ type: "input_text", text: "Rename this variable." }] },
      ],
    });

    expect(decision.target).toBe("luna");
    expect(decision.reasons).toEqual(["low complexity"]);
  });

  it("routes heavy user content to Sol", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: [
        { role: "developer", content: "Keep changes small." },
        { role: "user", content: [{ type: "text", text: "Investigate this race condition." }] },
      ],
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["risk"]);
  });

  it("scores each signal group only once", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Investigate this race condition, deadlock, concurrency, and security analysis.",
    });

    expect(decision.score).toBe(5);
    expect(decision.reasons).toEqual(["risk"]);
  });

  it("matches signals only on word boundaries", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Document the microarchitecture and debuggingTools modules.",
    });

    expect(decision.score).toBe(0);
    expect(decision.reasons).toEqual(["low complexity"]);
  });

  it("routes by the latest user message when an earlier request is complex", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: [
        { role: "user", content: "Investigate the architecture and race condition." },
        { type: "function_call", name: "search" },
        { role: "developer", content: "Always perform a security analysis." },
        { role: "user", content: [{ type: "input_text", text: "Rename this variable." }] },
      ],
    });

    expect(decision.target).toBe("luna");
    expect(decision.reasons).toEqual(["low complexity"]);
  });

  it("routes by the latest user message when an earlier request is simple", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: [
        { role: "user", content: "Rename this variable." },
        { type: "function_call_output", output: "architecture" },
        { role: "user", content: [{ type: "text", text: "Investigate this race condition." }] },
      ],
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["risk"]);
  });

  it("honors manual virtual models", () => {
    const strategy = new HeuristicRoutingStrategy();

    expect(strategy.route({ model: "router/luna", input: "security audit" }).target).toBe("luna");
    expect(strategy.route({ model: "router/sol", input: "typo" }).target).toBe("sol");
  });
});
