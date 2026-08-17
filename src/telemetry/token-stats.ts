import type { RoutingDecision, RoutingTarget } from "../router/routing-strategy.js";

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TokenStatsEntry = TokenUsage & {
  routedRequests: number;
  measuredResponses: number;
};

export type ShadowStatsEntry = {
  comparisons: number;
  disagreements: number;
  shadowErrors: number;
  primarySolRequests: number;
  shadowSolRequests: number;
  latencyMsTotal: number;
};

export type TokenStatsSnapshot = {
  total: TokenStatsEntry;
  models: Record<RoutingTarget, TokenStatsEntry>;
  shadow: ShadowStatsEntry;
};

const emptyEntry = (): TokenStatsEntry => ({
  routedRequests: 0,
  measuredResponses: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
});

const emptyShadowEntry = (): ShadowStatsEntry => ({
  comparisons: 0,
  disagreements: 0,
  shadowErrors: 0,
  primarySolRequests: 0,
  shadowSolRequests: 0,
  latencyMsTotal: 0,
});

export class TokenStats {
  private readonly entries: TokenStatsSnapshot = {
    total: emptyEntry(),
    models: { luna: emptyEntry(), sol: emptyEntry() },
    shadow: emptyShadowEntry(),
  };

  recordRouting(model: RoutingTarget): void {
    this.entries.models[model].routedRequests++;
    this.entries.total.routedRequests++;
  }

  recordUsage(model: RoutingTarget, usage: TokenUsage): void {
    addUsage(this.entries.models[model], usage);
    addUsage(this.entries.total, usage);
  }

  recordShadowComparison(comparison: { primary: RoutingDecision; shadow?: RoutingDecision; latencyMs: number }): void {
    const shadow = this.entries.shadow;
    shadow.comparisons++;
    shadow.latencyMsTotal += comparison.latencyMs;
    shadow.primarySolRequests += comparison.primary.target === "sol" ? 1 : 0;

    if (!comparison.shadow) {
      shadow.shadowErrors++;
      return;
    }

    shadow.shadowSolRequests += comparison.shadow.target === "sol" ? 1 : 0;
    shadow.disagreements += comparison.primary.target === comparison.shadow.target ? 0 : 1;
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