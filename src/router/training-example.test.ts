import { describe, expect, it } from "vitest";
import {
  deserializeRoutingTrainingExample,
  parseRoutingTrainingExample,
  serializeRoutingTrainingExample,
} from "./training-example.js";

const validExample = {
  schemaVersion: 1,
  request: "Run the test suite and fix the failing response route.",
  results: {
    luna: { score: 0.62, passed: false },
    sol: { score: 0.94, passed: true },
  },
  preferredModel: "sol",
  evaluation: { method: "tests" },
} as const;

describe("routing training example", () => {
  it("parses and serializes a versioned example", () => {
    const example = parseRoutingTrainingExample(validExample);
    const restored = deserializeRoutingTrainingExample(serializeRoutingTrainingExample(example));

    expect(restored).toEqual(validExample);
  });

  it("rejects incomplete or incompatible records", () => {
    expect(() => parseRoutingTrainingExample({ ...validExample, schemaVersion: 2 })).toThrow();
    expect(() => parseRoutingTrainingExample({ ...validExample, request: "" })).toThrow();
    expect(() =>
      parseRoutingTrainingExample({
        ...validExample,
        results: { ...validExample.results, sol: { score: Number.NaN, passed: true } },
      }),
    ).toThrow();
  });
});