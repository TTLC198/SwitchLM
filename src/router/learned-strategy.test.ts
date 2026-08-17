import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HeuristicRoutingStrategy } from "./heuristic-strategy.js";
import { createLearnedRoutingStrategy, LearnedRoutingStrategy } from "./learned-strategy.js";

const model = {
  schemaVersion: 1,
  threshold: 0,
  bias: 0,
  weights: { risk: 2, singleRename: -2 },
} as const;

describe("LearnedRoutingStrategy", () => {
  it("routes with exported weights and keeps virtual model overrides", () => {
    const strategy = new LearnedRoutingStrategy(model, new HeuristicRoutingStrategy());

    expect(strategy.route({ model: "router/auto", input: "Investigate this race condition." })).toMatchObject({
      target: "sol",
      score: 2,
      reasons: ["risk"],
    });
    expect(strategy.route({ model: "router/auto", input: "Rename this variable." })).toMatchObject({
      target: "luna",
      score: -2,
      reasons: ["singleRename"],
    });
    expect(strategy.route({ model: "router/luna", input: "Investigate this race condition." }).target).toBe("luna");
    expect(strategy.route({ model: "router/sol", input: "Rename this variable." }).target).toBe("sol");
  });

  it("analyzes only the latest user message", () => {
    const strategy = new LearnedRoutingStrategy(model, new HeuristicRoutingStrategy());
    const decision = strategy.route({
      model: "router/auto",
      input: [
        { role: "user", content: "Investigate this race condition." },
        { role: "user", content: "Rename this variable." },
      ],
    });

    expect(decision.target).toBe("luna");
    expect(decision.reasons).toEqual(["singleRename"]);
  });

  it("falls back to heuristics when the model file is missing or invalid", () => {
    const missing = createLearnedRoutingStrategy("missing-routing-model.json", 5);
    expect(missing.route({ model: "router/auto", input: "Investigate this race condition." }).reasons).toEqual(["risk"]);

    const directory = mkdtempSync(join(tmpdir(), "switchlm-model-"));
    const path = join(directory, "invalid.json");
    writeFileSync(path, "{}", "utf8");

    try {
      const invalid = createLearnedRoutingStrategy(path, 5);
      expect(invalid.route({ model: "router/auto", input: "Investigate this race condition." }).reasons).toEqual(["risk"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});