import type { RoutingComparison } from "./compare-routing.js";

export type QualityGateOptions = {
  maxSimpleAccuracyRegression?: number;
  maxSolRateIncrease?: number;
  minComplexAccuracyImprovement?: number;
};

export type QualityGateResult = {
  passed: boolean;
  violations: string[];
  metrics: {
    simpleAccuracyDelta: number | null;
    complexAccuracyDelta: number | null;
    solRateDelta: number;
  };
};

export function evaluateQualityGate(
  report: RoutingComparison,
  options: QualityGateOptions = {},
): QualityGateResult {
  const maxSimpleAccuracyRegression = options.maxSimpleAccuracyRegression ?? 0;
  const maxSolRateIncrease = options.maxSolRateIncrease ?? 0.1;
  const minComplexAccuracyImprovement = options.minComplexAccuracyImprovement ?? 0.01;
  const simpleAccuracyDelta = report.simple?.accuracyDelta ?? null;
  const complexAccuracyDelta = report.complex?.accuracyDelta ?? null;
  const solRateDelta = report.learned.solRate - report.baseline.solRate;
  const violations: string[] = [];

  if (simpleAccuracyDelta !== null && simpleAccuracyDelta < -maxSimpleAccuracyRegression) {
    violations.push("learned router regresses on simple tasks");
  }
  if (solRateDelta > maxSolRateIncrease) {
    violations.push("learned router increases Sol rate above the limit");
  }
  if (complexAccuracyDelta !== null && complexAccuracyDelta < minComplexAccuracyImprovement) {
    violations.push("learned router does not improve complex-task accuracy enough");
  }

  return { passed: violations.length === 0, violations, metrics: { simpleAccuracyDelta, complexAccuracyDelta, solRateDelta } };
}

export function assertQualityGate(report: RoutingComparison, options: QualityGateOptions = {}): QualityGateResult {
  const result = evaluateQualityGate(report, options);
  if (!result.passed) throw new Error(`Quality gate failed: ${result.violations.join("; ")}`);
  return result;
}
