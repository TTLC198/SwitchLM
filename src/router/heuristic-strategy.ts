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
