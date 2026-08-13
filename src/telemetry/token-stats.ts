import type { RoutingTarget } from "../router/routing-strategy.js";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TokenStatsEntry = TokenUsage & {
  requests: number;
};

export type TokenStatsSnapshot = {
  total: TokenStatsEntry;
  models: Record<RoutingTarget, TokenStatsEntry>;
};

const emptyEntry = (): TokenStatsEntry => ({ requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 });

export class TokenStats {
  private readonly entries: TokenStatsSnapshot = {
    total: emptyEntry(),
    models: { luna: emptyEntry(), sol: emptyEntry() },
  };

  record(model: RoutingTarget, usage: TokenUsage): void {
    add(this.entries.models[model], usage);
    add(this.entries.total, usage);
  }

  snapshot(): TokenStatsSnapshot {
    return structuredClone(this.entries);
  }
}

function add(entry: TokenStatsEntry, usage: TokenUsage): void {
  entry.requests++;
  entry.inputTokens += usage.inputTokens;
  entry.outputTokens += usage.outputTokens;
  entry.totalTokens += usage.totalTokens;
}
