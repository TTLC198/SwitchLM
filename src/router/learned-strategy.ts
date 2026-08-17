import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { RoutingDecision, RoutingRequest, RoutingStrategy } from "./routing-strategy.js";
import { HeuristicRoutingStrategy } from "./heuristic-strategy.js";

const learnedModelSchema = z.object({
  schemaVersion: z.literal(1),
  threshold: z.number().finite(),
  bias: z.number().finite(),
  weights: z.record(z.string(), z.number().finite()),
});

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

export class LearnedRoutingStrategy implements RoutingStrategy {
  constructor(
    private readonly model: z.infer<typeof learnedModelSchema>,
    private readonly fallback: RoutingStrategy,
  ) {}

  route(request: RoutingRequest): RoutingDecision {
    if (request.model === "router/luna" || request.model === "router/sol") {
      return this.fallback.route(request);
    }

    const text = textFromInput(request.input);
    if (!text) {
      return this.fallback.route(request);
    }

    const features = extractFeatures(text);
    const score = this.model.bias + Object.entries(features).reduce(
      (total, [feature, value]) => total + (this.model.weights[feature] ?? 0) * value,
      0,
    );
    const reasons = Object.keys(features).filter((feature) => (this.model.weights[feature] ?? 0) !== 0);

    return {
      target: score >= this.model.threshold ? "sol" : "luna",
      score,
      reasons: reasons.length ? reasons : ["learned model"],
    };
  }
}

export function createLearnedRoutingStrategy(modelPath: string | undefined, solThreshold: number): RoutingStrategy {
  const fallback = new HeuristicRoutingStrategy(solThreshold);

  if (!modelPath) {
    return fallback;
  }

  try {
    const model = learnedModelSchema.parse(JSON.parse(readFileSync(resolve(modelPath), "utf8")));
    return new LearnedRoutingStrategy(model, fallback);
  } catch {
    return fallback;
  }
}

function extractFeatures(input: string): Record<string, number> {
  const text = input.toLowerCase();
  const features: Record<string, number> = {};

  for (const [name, pattern] of featurePatterns) {
    if (pattern.test(text)) {
      features[name] = 1;
    }
  }

  return features;
}

function textFromInput(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (!Array.isArray(input)) {
    return "";
  }

  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index];
    if (item && typeof item === "object" && "role" in item && item.role === "user") {
      return textFromUserMessage(item);
    }
  }

  return "";
}

function textFromUserMessage(item: unknown): string {
  if (!item || typeof item !== "object" || !("content" in item)) {
    return "";
  }

  if (typeof item.content === "string") {
    return item.content;
  }

  if (!Array.isArray(item.content)) {
    return "";
  }

  return item.content
    .filter(
      (part): part is { type: "input_text" | "text"; text: string } =>
        Boolean(
          part &&
            typeof part === "object" &&
            "type" in part &&
            (part.type === "input_text" || part.type === "text") &&
            "text" in part &&
            typeof part.text === "string",
        ),
    )
    .map((part) => part.text)
    .join("\n");
}
