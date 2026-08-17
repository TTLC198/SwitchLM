import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { HeuristicRoutingStrategy } from "../../src/router/heuristic-strategy.js";
import type { RoutingStrategy, RoutingTarget } from "../../src/router/routing-strategy.js";

const validationScenarioSchema = z.object({
  id: z.string().min(1),
  input: z.string().min(1),
  expectedTarget: z.enum(["luna", "sol"]),
});

const validationSetSchema = z.object({
  version: z.literal(1),
  scenarios: z.array(validationScenarioSchema).min(1),
});

export type ValidationScenario = z.infer<typeof validationScenarioSchema>;
export type ValidationSet = z.infer<typeof validationSetSchema>;

export type RoutingEvaluation = {
  total: number;
  correct: number;
  accuracy: number;
  solRate: number;
  errors: Array<{
    id: string;
    expectedTarget: RoutingTarget;
    actualTarget: RoutingTarget;
    score: number;
    reasons: string[];
  }>;
};

export async function loadValidationSet(path = "tools/routing/validation-set.json"): Promise<ValidationSet> {
  return validationSetSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export function evaluateRoutingSet(
  scenarios: readonly ValidationScenario[],
  strategy: RoutingStrategy = new HeuristicRoutingStrategy(),
): RoutingEvaluation {
  const errors: RoutingEvaluation["errors"] = [];
  let solCount = 0;

  for (const scenario of scenarios) {
    const decision = strategy.route({ model: "router/auto", input: scenario.input });
    solCount += decision.target === "sol" ? 1 : 0;

    if (decision.target !== scenario.expectedTarget) {
      errors.push({
        id: scenario.id,
        expectedTarget: scenario.expectedTarget,
        actualTarget: decision.target,
        score: decision.score,
        reasons: decision.reasons,
      });
    }
  }

  const total = scenarios.length;
  const correct = total - errors.length;

  return {
    total,
    correct,
    accuracy: correct / total,
    solRate: solCount / total,
    errors,
  };
}

export async function runEvaluation(path?: string): Promise<RoutingEvaluation> {
  const validationSet = await loadValidationSet(path);
  return evaluateRoutingSet(validationSet.scenarios);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/evaluate.ts")) {
  void runEvaluation(process.argv[2]).then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });
}

