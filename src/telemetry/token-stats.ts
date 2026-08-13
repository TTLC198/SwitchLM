import type { RoutingTarget } from "../router/routing-strategy.js";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TokenStatsEntry = TokenUsage & {
  routedRequests: number;
  measuredResponses: number;
};

export type TokenStatsSnapshot = {
  total: TokenStatsEntry;
  models: Record<RoutingTarget, TokenStatsEntry>;
};

const emptyEntry = (): TokenStatsEntry => ({
  routedRequests: 0,
  measuredResponses: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

export class TokenStats {
  private readonly entries: TokenStatsSnapshot = {
    total: emptyEntry(),
    models: { luna: emptyEntry(), sol: emptyEntry() },
  };

  recordRouting(model: RoutingTarget): void {
    this.entries.models[model].routedRequests++;
    this.entries.total.routedRequests++;
  }

  recordUsage(model: RoutingTarget, usage: TokenUsage): void {
    addUsage(this.entries.models[model], usage);
    addUsage(this.entries.total, usage);
  }

  snapshot(): TokenStatsSnapshot {
    return structuredClone(this.entries);
  }
}

function addUsage(entry: TokenStatsEntry, usage: TokenUsage): void {
  entry.measuredResponses++;
  entry.inputTokens += usage.inputTokens;
  entry.outputTokens += usage.outputTokens;
  entry.totalTokens += usage.totalTokens;
}
