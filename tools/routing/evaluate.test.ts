import { describe, expect, it } from "vitest";
import { evaluateRoutingSet, loadValidationSet } from "./evaluate.js";

describe("routing validation evaluator", () => {
  it("evaluates the committed validation set without providers", async () => {
    const validationSet = await loadValidationSet();
    const report = evaluateRoutingSet(validationSet.scenarios);

    expect(report).toEqual({
      total: 10,
      correct: 10,
      accuracy: 1,
      solRate: 0.6,
      errors: [],
    });
  });

  it("reports wrong target, score, and reasons", () => {
    const report = evaluateRoutingSet([
      { id: "expected-luna", input: "Rename this variable.", expectedTarget: "sol" },
    ]);

    expect(report.total).toBe(1);
    expect(report.correct).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(report.solRate).toBe(0);
    expect(report.errors).toEqual([
      {
        id: "expected-luna",
        expectedTarget: "sol",
        actualTarget: "luna",
        score: -2,
        reasons: ["single rename"],
      },
    ]);
  });
});