import type { RoutingStrategy, RoutingTarget } from "../../src/router/routing-strategy.js";

export type ComparisonScenario = {
  id: string;
  input: string;
  expectedTarget: RoutingTarget;
  isSimple?: boolean;
  baselineLatencyMs?: number;
  learnedLatencyMs?: number;
};

export type RoutingMetrics = {
  total: number;
  correct: number;
  accuracy: number;
  solRate: number;
  precisionSol: number;
  recallSol: number;
  latencyP50: number | null;
  latencyP95: number | null;
};

export type RoutingComparison = {
  modelMetadata: { schemaVersion: 1; modelVersion: string };
  baseline: RoutingMetrics;
  learned: RoutingMetrics;
  disagreementRate: number;
  simple: { baseline: RoutingMetrics; learned: RoutingMetrics; accuracyDelta: number } | null;
  complex: { baseline: RoutingMetrics; learned: RoutingMetrics; accuracyDelta: number } | null;
};

export function compareRouting(
  scenarios: readonly ComparisonScenario[],
  baseline: RoutingStrategy,
  learned: RoutingStrategy,
  modelVersion = "unknown",
): RoutingComparison {
  const baselineDecisions = scenarios.map((scenario) => baseline.route({ model: "router/auto", input: scenario.input }));
  const learnedDecisions = scenarios.map((scenario) => learned.route({ model: "router/auto", input: scenario.input }));
  const baselineMetrics = calculateMetrics(scenarios, baselineDecisions.map((decision, index) => ({ target: decision.target, latencyMs: scenarios[index].baselineLatencyMs })));
  const learnedMetrics = calculateMetrics(scenarios, learnedDecisions.map((decision, index) => ({ target: decision.target, latencyMs: scenarios[index].learnedLatencyMs })));
  const disagreementCount = baselineDecisions.filter((decision, index) => decision.target !== learnedDecisions[index].target).length;

  return {
    modelMetadata: { schemaVersion: 1, modelVersion },
    baseline: baselineMetrics,
    learned: learnedMetrics,
    disagreementRate: scenarios.length ? disagreementCount / scenarios.length : 0,
    simple: compareSubset(scenarios, baseline, learned, true),
    complex: compareSubset(scenarios, baseline, learned, false),
  };
}

function compareSubset(
  scenarios: readonly ComparisonScenario[],
  baseline: RoutingStrategy,
  learned: RoutingStrategy,
  simple: boolean,
): RoutingComparison["simple"] {
  const subset = scenarios.filter((scenario) => scenario.isSimple === simple);
  if (!subset.length) return null;
  const baselineMetrics = calculateMetrics(subset, subset.map((scenario) => ({ target: baseline.route({ model: "router/auto", input: scenario.input }).target, latencyMs: scenario.baselineLatencyMs })));
  const learnedMetrics = calculateMetrics(subset, subset.map((scenario) => ({ target: learned.route({ model: "router/auto", input: scenario.input }).target, latencyMs: scenario.learnedLatencyMs })));
  return { baseline: baselineMetrics, learned: learnedMetrics, accuracyDelta: learnedMetrics.accuracy - baselineMetrics.accuracy };
}

function calculateMetrics(
  scenarios: readonly ComparisonScenario[],
  decisions: ReadonlyArray<{ target: RoutingTarget; latencyMs?: number }>,
): RoutingMetrics {
  let correct = 0;
  let truePositive = 0;
  let predictedPositive = 0;
  let actualPositive = 0;
  const latencies = decisions.flatMap((decision) => typeof decision.latencyMs === "number" && Number.isFinite(decision.latencyMs) ? [decision.latencyMs] : []);

  scenarios.forEach((scenario, index) => {
    const target = decisions[index].target;
    if (target === scenario.expectedTarget) correct += 1;
    if (target === "sol") predictedPositive += 1;
    if (scenario.expectedTarget === "sol") actualPositive += 1;
    if (target === "sol" && scenario.expectedTarget === "sol") truePositive += 1;
  });

  return {
    total: scenarios.length,
    correct,
    accuracy: scenarios.length ? correct / scenarios.length : 0,
    solRate: scenarios.length ? predictedPositive / scenarios.length : 0,
    precisionSol: predictedPositive ? truePositive / predictedPositive : 0,
    recallSol: actualPositive ? truePositive / actualPositive : 0,
    latencyP50: percentile(latencies, 0.5),
    latencyP95: percentile(latencies, 0.95),
  };
}

function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

