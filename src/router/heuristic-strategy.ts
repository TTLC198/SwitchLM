import type { RoutingDecision, RoutingRequest, RoutingStrategy } from "./routing-strategy.js";

const heavySignalGroups = [
  {
    reason: "risk",
    weight: 5,
    signals: [/\brace condition\b/u, /\bdeadlock\b/u, /\bconcurrency\b/u, /\bsecurity (?:audit|analysis)\b/u],
  },
  {
    reason: "architecture",
    weight: 4,
    signals: [/\barchitecture\b/u, /\bredesign\b/u, /\blarge refactor(?:ing)?\b/u],
  },
  {
    reason: "scope",
    weight: 3,
    signals: [/\bmultiple modules\b/u, /\bcross-module\b/u, /\brepository-wide\b/u, /\bentire repo\b/u],
  },
  { reason: "diagnostics", weight: 2, signals: [/\bdebugging\b/u] },
] as const;

export class HeuristicRoutingStrategy implements RoutingStrategy {
  constructor(private readonly solThreshold = 5) {}

  route(request: RoutingRequest): RoutingDecision {
    if (request.model === "router/luna") {
      return { target: "luna", score: 0, reasons: ["forced router/luna"] };
    }

    if (request.model === "router/sol") {
      return { target: "sol", score: Number.POSITIVE_INFINITY, reasons: ["forced router/sol"] };
    }

    const text = textFromInput(request.input).toLowerCase();
    const reasons: string[] = [];
    let score = 0;

    for (const group of heavySignalGroups) {
      if (group.signals.some((signal) => signal.test(text))) {
        score += group.weight;
        reasons.push(group.reason);
      }
    }

    const filePathCount = text.match(/\b(?:[\w.-]+[\\/])+\w[\w.-]*\b/gu)?.length ?? 0;
    const moduleCount = text.match(/\b[\w.-]+\s+modules?\b/gu)?.length ?? 0;
    const hasMultipleFiles = filePathCount >= 2;
    const hasMultipleModules = moduleCount >= 2 || /\bmultiple modules\b/u.test(text);
    const hasCodeBlock = text.includes("```");
    const hasStackTrace = /\bstack trace\b/u.test(text) || /^\s*at\s+\S+.*:\d+:\d+\)?\s*$/mu.test(text);
    const hasLogs = /\blogs?\b/u.test(text) || /^\s*(?:\[[^\]]+\]\s*)?(?:error|warn(?:ing)?|info|debug)\b[:\s]/imu.test(text);
    const requirementCount = text.match(/^\s*(?:[-*]|\d+[.)])\s+/gmu)?.length ?? 0;

    if (hasMultipleFiles) {
      score += 2;
      reasons.push("multiple files");
    }

    if (hasMultipleModules) {
      score += 2;
      reasons.push("multiple modules");
    }

    if (hasCodeBlock) {
      score += 1;
      reasons.push("code block");
    }

    if (hasStackTrace) {
      score += 2;
      reasons.push("stack trace");
    }

    if (hasLogs) {
      score += 1;
      reasons.push("logs");
    }

    if (requirementCount >= 2) {
      score += 2;
      reasons.push("multiple requirements");
    }

    if (reasons.includes("architecture") && hasMultipleModules) {
      score += 2;
      reasons.push("architecture across modules");
    }

    if (reasons.includes("diagnostics") && hasStackTrace) {
      score += 2;
      reasons.push("diagnostics with stack trace");
    }

    if (/\bsecurity (?:audit|analysis)\b/u.test(text) && /\b(?:change|modify|update|fix|implement|patch|refactor|rewrite)\b/u.test(text)) {
      score += 2;
      reasons.push("security code change");
    }

    if (text.length > 12000) {
      score += 3;
      reasons.push("large context");
    }

    return {
      target: score >= this.solThreshold ? "sol" : "luna",
      score,
      reasons: reasons.length ? reasons : ["low complexity"],
    };
  }
}

function textFromInput(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    for (let index = input.length - 1; index >= 0; index--) {
      const item = input[index];

      if (item && typeof item === "object" && "role" in item && item.role === "user") {
        return textFromUserMessage(item);
      }
    }
  }

  return "";
}

function textFromUserMessage(item: unknown): string {
  if (!item || typeof item !== "object" || !("role" in item) || item.role !== "user" || !("content" in item)) {
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
