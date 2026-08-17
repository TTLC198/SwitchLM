import { describe, expect, it } from "vitest";
import { HeuristicRoutingStrategy } from "../../src/router/heuristic-strategy.js";
import type { RoutingStrategy } from "../../src/router/routing-strategy.js";
import { compareRouting } from "./compare-routing.js";
import { assertQualityGate, evaluateQualityGate } from "./quality-gate.js";

class FixedStrategy implements RoutingStrategy {
  constructor(private readonly target: "luna" | "sol") {}
  route() { return { target: this.target, score: 0, reasons: ["test"] }; }
}

class SplitStrategy implements RoutingStrategy {
  route(request: { input: unknown }) {
    return { target: request.input === "b" ? "sol" : "luna", score: 0, reasons: ["test"] } as const;
  }
}

describe("compareRouting", () => {
  it("calculates accuracy, Sol metrics, disagreement and latency percentiles", () => {
    const report = compareRouting([
      { id: "1", input: "a", expectedTarget: "sol", baselineLatencyMs: 10, learnedLatencyMs: 20 },
      { id: "2", input: "b", expectedTarget: "luna", baselineLatencyMs: 30, learnedLatencyMs: 40 },
    ], new FixedStrategy("luna"), new FixedStrategy("sol"), "model-7");

    expect(report.modelMetadata).toEqual({ schemaVersion: 1, modelVersion: "model-7" });
    expect(report.baseline).toMatchObject({ accuracy: 0.5, solRate: 0, precisionSol: 0, recallSol: 0, latencyP50: 10, latencyP95: 30 });
    expect(report.learned).toMatchObject({ accuracy: 0.5, solRate: 1, precisionSol: 0.5, recallSol: 1, latencyP50: 20, latencyP95: 40 });
    expect(report.disagreementRate).toBe(1);
  });

  it("keeps simple and complex slices separate", () => {
    const report = compareRouting([
      { id: "simple", input: "format file", expectedTarget: "luna", isSimple: true },
      { id: "complex", input: "architecture redesign", expectedTarget: "sol", isSimple: false },
    ], new HeuristicRoutingStrategy(5), new FixedStrategy("sol"));

    expect(report.simple?.accuracyDelta).toBeLessThan(0);
    expect(report.complex?.accuracyDelta).toBeGreaterThan(0);
  });
});

describe("quality gate", () => {
  it("passes when simple tasks do not regress and complex tasks improve", () => {
    const report = compareRouting([
      { id: "simple", input: "a", expectedTarget: "luna", isSimple: true },
      { id: "complex", input: "b", expectedTarget: "sol", isSimple: false },
    ], new FixedStrategy("luna"), new SplitStrategy());
    expect(evaluateQualityGate(report, { maxSolRateIncrease: 1, minComplexAccuracyImprovement: 0.5 }).passed).toBe(true);
    expect(() => assertQualityGate(report, { maxSolRateIncrease: 1, minComplexAccuracyImprovement: 0.5 })).not.toThrow();
  });

  it("fails on simple regression, excessive Sol rate, or missing complex improvement", () => {
    const report = compareRouting([{ id: "simple", input: "a", expectedTarget: "luna", isSimple: true }], new FixedStrategy("luna"), new FixedStrategy("sol"));
    const result = evaluateQualityGate(report, { maxSolRateIncrease: 0.1, minComplexAccuracyImprovement: 0.01 });
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(expect.arrayContaining(["learned router regresses on simple tasks", "learned router increases Sol rate above the limit"]));
    expect(() => assertQualityGate(report)).toThrow("Quality gate failed");
  });
});
