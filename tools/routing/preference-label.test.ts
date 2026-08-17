import { describe, expect, it } from "vitest";
import type { QualityAssessment } from "./quality-adapters.js";
import { labelPreference } from "./preference-label.js";

function assessment(score: number | null): QualityAssessment {
  return { method: "tests", adapterVersion: "1", technicalStatus: score === null ? "unknown" : "passed", score };
}

describe("labelPreference", () => {
  it("labels the higher quality model", () => {
    expect(labelPreference({ luna: assessment(0), sol: assessment(1) })).toEqual({
      preferredModel: "sol", status: "labelled", scoreDelta: 1, reason: "sol-higher",
    });
  });

  it("keeps equal and near-equal pairs unlabelled", () => {
    expect(labelPreference({ luna: assessment(1), sol: assessment(1) })).toMatchObject({ status: "unlabelled", reason: "tie" });
    expect(labelPreference({ luna: assessment(0.6), sol: assessment(0.64) }, 0.05)).toMatchObject({ status: "unlabelled", reason: "ambiguous" });
  });

  it("does not force a label when one score is missing", () => {
    expect(labelPreference({ luna: assessment(null), sol: assessment(1) })).toEqual({
      preferredModel: null, status: "unlabelled", scoreDelta: null, reason: "missing-score",
    });
  });
});
