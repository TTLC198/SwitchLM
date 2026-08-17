import { describe, expect, it } from "vitest";
import { HeuristicRoutingStrategy } from "./heuristic-strategy.js";

describe("HeuristicRoutingStrategy", () => {
  it("routes simple coding tasks to Luna", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Rename this variable and fix the typo.",
    });

    expect(decision.target).toBe("luna");
    expect(decision.score).toBe(-4);
    expect(decision.reasons).toEqual(["typo fix", "single rename"]);
  });

  it("lowers the score for formatting one file", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Format src/router.ts and update imports.",
    });

    expect(decision.target).toBe("luna");
    expect(decision.score).toBe(-3);
    expect(decision.reasons).toEqual(["formatting", "single file"]);
  });

  it("does not let simple signals cancel hard risk", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Fix the typo in src/shared.ts and investigate this race condition.",
    });

    expect(decision.target).toBe("sol");
    expect(decision.score).toBe(5);
    expect(decision.reasons).toEqual(["risk"]);
  });

  it("routes complex architecture and concurrency tasks to Sol", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Do an architecture redesign and investigate a race condition across multiple modules.",
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["risk", "architecture", "scope", "multiple modules", "architecture across modules"]);
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
    expect(decision.reasons).toEqual(["single rename"]);
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

  it("combines structural signals from files, code, logs, and requirements", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: [
        "Update src/api.ts and src/server.ts.",
        "- Preserve the response schema.",
        "- Add error handling.",
        "```ts",
        "throw new Error();",
        "```",
        "ERROR: request failed",
      ].join("\n"),
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["multiple files", "code block", "logs", "multiple requirements"]);
  });

  it("adds a bonus for architecture across multiple modules", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Review the architecture of the auth module and billing module.",
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["architecture", "multiple modules", "architecture across modules"]);
  });

  it("adds a bonus for diagnostics with a stack trace", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Debugging this failure.\nError: failed\n    at run (src/app.ts:10:2)",
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["diagnostics", "stack trace", "logs", "diagnostics with stack trace"]);
  });

  it("adds a bonus for security analysis with code changes", () => {
    const decision = new HeuristicRoutingStrategy().route({
      model: "router/auto",
      input: "Perform a security analysis and update src/auth.ts.",
    });

    expect(decision.target).toBe("sol");
    expect(decision.reasons).toEqual(["risk", "security code change"]);
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
    expect(decision.reasons).toEqual(["single rename"]);
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
