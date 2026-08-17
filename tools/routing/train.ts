import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  deserializeRoutingTrainingExample,
  type RoutingTrainingExample,
} from "../../src/router/training-example.js";
import type { RoutingTarget } from "../../src/router/routing-strategy.js";
import { parseRoutingModel, serializeRoutingModel, type RoutingModel } from "./model-schema.js";
import type { ValidationScenario } from "./evaluate.js";

const featurePatterns = [
  ["risk", /\b(?:race condition|deadlock|concurrency|security (?:audit|analysis))\b/u],
  ["architecture", /\b(?:architecture|redesign|large refactor(?:ing)?)\b/u],
  ["scope", /\b(?:multiple modules|cross-module|repository-wide|entire repo)\b/u],
  ["diagnostics", /\bdebugging\b/u],
  ["multipleFiles", /\b(?:[\w.-]+[\\/])+\w[\w.-]*\b.*\b(?:[\w.-]+[\\/])+\w[\w.-]*\b/su],
  ["multipleModules", /\b\w[\w.-]*\s+modules?\b.*\b\w[\w.-]*\s+modules?\b/su],
  ["codeBlock", /```/u],
  ["stackTrace", /\bstack trace\b|^\s*at\s+\S+.*:\d+:\d+\)?\s*$/mu],
  ["logs", /\blogs?\b|^\s*(?:\[[^\]]+\]\s*)?(?:error|warn(?:ing)?|info|debug)\b[:\s]/imu],
  ["multipleRequirements", /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+.*(?:\n|$).*\n\s*(?:[-*]|\d+[.)])\s+/su],
  ["typoFix", /\b(?:fix|correct)\b[^.\n]*\btypos?\b/u],
  ["singleRename", /\brename\b[^.\n]*\b(?:variable|function|method|class|symbol|identifier)\b/u],
  ["formatting", /\b(?:format|formatting|prettier)\b/u],
  ["singleFile", /\b(?:change|modify|update|fix|implement|patch|refactor|rewrite|format)\b[^\n]*\b(?:[\w.-]+[\\/])+\w[\w.-]*\b/u],
] as const;

export type RoutingFeature = (typeof featurePatterns)[number][0];
export type RoutingFeatures = Partial<Record<RoutingFeature, number>>;

export type { RoutingTrainingExample } from "../../src/router/training-example.js";

export type TrainingInput = {
  preferredModel: "luna" | "sol";
  request?: string;
  routingFeatures?: RoutingFeatures;
};

export type ModelPrediction = {
  target: RoutingTarget;
  score: number;
  reasons: string[];
};

export type ModelEvaluation = {
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

export function extractRoutingFeatures(input: string): RoutingFeatures {
  const text = input.toLowerCase();
  const features: RoutingFeatures = {};

  for (const [name, pattern] of featurePatterns) {
    if (pattern.test(text)) {
      features[name] = 1;
    }
  }

  return features;
}

export function trainRoutingModel(
  examples: readonly (RoutingTrainingExample | TrainingInput)[],
  options: { epochs?: number; learningRate?: number } = {},
): RoutingModel {
  const epochs = options.epochs ?? 10;
  const learningRate = options.learningRate ?? 1;
  let bias = 0;
  const weights: Record<string, number> = {};

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (const example of examples) {
      const parsed = example;
      const features = "routingFeatures" in parsed && parsed.routingFeatures
        ? parsed.routingFeatures
        : extractRoutingFeatures("request" in parsed ? parsed.request ?? "" : "");
      const label = parsed.preferredModel === "sol" ? 1 : -1;
      const score = predictScore({ bias, weights }, features);

      if (label * score <= 0) {
        bias += learningRate * label;
        for (const [feature, value] of Object.entries(features)) {
          weights[feature] = (weights[feature] ?? 0) + learningRate * label * value;
        }
      }
    }
  }

  return parseRoutingModel({ schemaVersion: 1, threshold: 0, bias, weights });
}

export function predictRoutingModel(model: RoutingModel, input: string): ModelPrediction {
  const features = extractRoutingFeatures(input);
  const score = predictScore(model, features);
  const reasons = Object.keys(features).filter((feature) => (model.weights[feature] ?? 0) !== 0);

  return {
    target: score >= model.threshold ? "sol" : "luna",
    score,
    reasons,
  };
}

export function evaluateRoutingModel(
  model: RoutingModel,
  scenarios: readonly ValidationScenario[],
): ModelEvaluation {
  const errors: ModelEvaluation["errors"] = [];
  let solCount = 0;

  for (const scenario of scenarios) {
    const prediction = predictRoutingModel(model, scenario.input);
    solCount += prediction.target === "sol" ? 1 : 0;

    if (prediction.target !== scenario.expectedTarget) {
      errors.push({
        id: scenario.id,
        expectedTarget: scenario.expectedTarget,
        actualTarget: prediction.target,
        score: prediction.score,
        reasons: prediction.reasons,
      });
    }
  }

  const total = scenarios.length;
  const correct = total - errors.length;
  return { total, correct, accuracy: correct / total, solRate: solCount / total, errors };
}

export async function loadTrainingExamples(path: string): Promise<RoutingTrainingExample[]> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean);
  return lines.map((line) => deserializeRoutingTrainingExample(line));
}

export async function trainFromFile(inputPath: string, outputPath: string): Promise<RoutingModel> {
  const model = trainRoutingModel(await loadTrainingExamples(inputPath));
  await writeFile(outputPath, `${serializeRoutingModel(model)}\n`, "utf8");
  return model;
}

function predictScore(model: Pick<RoutingModel, "bias" | "weights">, features: RoutingFeatures): number {
  return model.bias + Object.entries(features).reduce((score, [feature, value]) => score + (model.weights[feature] ?? 0) * value, 0);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/train.ts")) {
  const inputPath = process.argv[2] ?? "tools/routing/training-data.jsonl";
  const outputPath = process.argv[3] ?? "tools/routing/routing-model.json";
  void trainFromFile(inputPath, outputPath).then((model) => {
    process.stdout.write(`${serializeRoutingModel(model)}\n`);
  });
}


