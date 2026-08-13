import { describe, expect, it } from "vitest";
import { TokenStats } from "./token-stats.js";

describe("TokenStats", () => {
  it("aggregates token usage by model and total", () => {
    const stats = new TokenStats();

    stats.recordRouting("luna");
    stats.recordUsage("luna", { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    stats.recordRouting("sol");
    stats.recordUsage("sol", { inputTokens: 20, outputTokens: 8, totalTokens: 28 });
    stats.recordRouting("luna");
    stats.recordUsage("luna", { inputTokens: 2, outputTokens: 1, totalTokens: 3 });
    stats.recordRouting("luna");

    expect(stats.snapshot()).toEqual({
      total: { routedRequests: 4, measuredResponses: 3, inputTokens: 32, outputTokens: 14, totalTokens: 46 },
      models: {
        luna: { routedRequests: 3, measuredResponses: 2, inputTokens: 12, outputTokens: 6, totalTokens: 18 },
        sol: { routedRequests: 1, measuredResponses: 1, inputTokens: 20, outputTokens: 8, totalTokens: 28 },
      },
    });
  });
});
