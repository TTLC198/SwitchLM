import { describe, expect, it } from "vitest";
import { assessQuality, createQualityAdapter } from "./quality-adapters.js";

const base = { method: "tests" as const, status: "passed" as const };

describe("quality adapters", () => {
  it("maps automated outcomes to technical status and score", () => {
    expect(assessQuality(base)).toEqual({ method: "tests", adapterVersion: "1", technicalStatus: "passed", score: 1 });
    expect(assessQuality({ method: "build", status: "failed", diagnosticCode: "BUILD_FAILED" })).toEqual({
      method: "build", adapterVersion: "1", technicalStatus: "failed", score: 0, diagnosticCode: "BUILD_FAILED",
    });
  });

  it("does not turn provider or runner errors into quality", () => {
    expect(assessQuality({ method: "typecheck", status: "error", diagnosticCode: "TIMEOUT" })).toMatchObject({
      technicalStatus: "unknown", score: null, diagnosticCode: "TIMEOUT",
    });
  });

  it("requires an explicit human score and keeps adapter version", () => {
    expect(createQualityAdapter("human").evaluate({ method: "human", status: "passed", score: 0.75 })).toEqual({
      method: "human", adapterVersion: "1", technicalStatus: "passed", score: 0.75,
    });
    expect(assessQuality({ method: "human", status: "unknown" })).toMatchObject({ technicalStatus: "unknown", score: null });
  });

  it("rejects mismatched evidence", () => {
    expect(() => createQualityAdapter("tests").evaluate({ method: "build", status: "passed" })).toThrow("method mismatch");
  });
});
