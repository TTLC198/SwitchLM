import { describe, expect, it } from "vitest";
import { TokenStats } from "./token-stats.js";

describe("TokenStats", () => {
  it("aggregates token usage by model and total", () => {
    const stats = new TokenStats();

    stats.record("luna", { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    stats.record("sol", { inputTokens: 20, outputTokens: 8, totalTokens: 28 });
    stats.record("luna", { inputTokens: 2, outputTokens: 1, totalTokens: 3 });

    expect(stats.snapshot()).toEqual({
      total: { requests: 3, inputTokens: 32, outputTokens: 14, totalTokens: 46 },
      models: {
        luna: { requests: 2, inputTokens: 12, outputTokens: 6, totalTokens: 18 },
        sol: { requests: 1, inputTokens: 20, outputTokens: 8, totalTokens: 28 },
      },
    });
  });
});
