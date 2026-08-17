import { describe, expect, it } from "vitest";
import { evaluateRoutingSet, loadValidationSet } from "./evaluate.js";
import { parseRoutingModel, serializeRoutingModel } from "./model-schema.js";
import {
  evaluateRoutingModel,
  predictRoutingModel,
  trainRoutingModel,
  type RoutingTrainingExample,
} from "./train.js";

const examples: RoutingTrainingExample[] = [
  {
    schemaVersion: 1,
    request: "Rename this variable.",
    results: { luna: { score: 0.9, passed: true }, sol: { score: 0.4, passed: false } },
    preferredModel: "luna",
    evaluation: { method: "tests" },
  },
  {
    schemaVersion: 1,
    request: "Investigate this race condition.",
    results: { luna: { score: 0.3, passed: false }, sol: { score: 0.9, passed: true } },
    preferredModel: "sol",
    evaluation: { method: "tests" },
  },
  {
    schemaVersion: 1,
    request: "Review the architecture of the auth module and billing module.",
    results: { luna: { score: 0.4, passed: false }, sol: { score: 0.9, passed: true } },
    preferredModel: "sol",
    evaluation: { method: "human" },
  },
  {
    schemaVersion: 1,
    request: "Format src/router.ts and update imports.",
    results: { luna: { score: 0.9, passed: true }, sol: { score: 0.5, passed: true } },
    preferredModel: "luna",
    evaluation: { method: "tests" },
  },
];

describe("offline routing trainer", () => {
  it("trains reproducible weights and predicts both targets", () => {
    const first = trainRoutingModel(examples);
    const second = trainRoutingModel(examples);

    expect(first).toEqual(second);
    expect(predictRoutingModel(first, "Rename this variable.").target).toBe("luna");
    expect(predictRoutingModel(first, "Investigate this race condition.").target).toBe("sol");
  });

  it("round-trips the versioned model schema", () => {
    const model = trainRoutingModel(examples);

    expect(parseRoutingModel(JSON.parse(serializeRoutingModel(model)))).toEqual(model);
    expect(() => parseRoutingModel({ ...model, schemaVersion: 2 })).toThrow();
  });

  it("produces a comparable report on the held-out validation set", async () => {
    const validationSet = await loadValidationSet();
    const baseline = evaluateRoutingSet(validationSet.scenarios);
    const learned = evaluateRoutingModel(trainRoutingModel(examples), validationSet.scenarios);

    expect(learned.total).toBe(baseline.total);
    expect(learned.accuracy).toBeGreaterThanOrEqual(0);
    expect(learned.solRate).toBeGreaterThanOrEqual(0);
    expect(learned.solRate).toBeLessThanOrEqual(1);
  });
});