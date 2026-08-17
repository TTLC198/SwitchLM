import { createHmac } from "node:crypto";
import { routingTrainingExampleSchema, type RoutingTrainingExample } from "./training-example.js";
import { z } from "zod";

export type TrainingRecord = Omit<RoutingTrainingExample, "request" | "schemaVersion"> & {
  schemaVersion: 2;
  collectedAt: string;
  requestId: string;
  features: {
    charCount: number;
    lineCount: number;
    wordCount: number;
    codeBlockCount: number;
    listItemCount: number;
    hasErrorSignal: boolean;
    hasPathSignal: boolean;
    routingFeatures: Record<string, number>;
  };
  requestPreview?: string;
};

export const trainingRecordSchema = z.object({
  schemaVersion: z.literal(2),
  collectedAt: z.string().datetime(),
  requestId: z.string().regex(/^[a-f0-9]{64}$/u),
  features: z.object({
    charCount: z.number().int().nonnegative(),
    lineCount: z.number().int().positive(),
    wordCount: z.number().int().nonnegative(),
    codeBlockCount: z.number().int().nonnegative(),
    listItemCount: z.number().int().nonnegative(),
    hasErrorSignal: z.boolean(),
    hasPathSignal: z.boolean(),
    routingFeatures: z.record(z.string(), z.number().finite()),
  }),
  results: z.object({
    luna: z.object({ score: z.number().finite(), passed: z.boolean() }),
    sol: z.object({ score: z.number().finite(), passed: z.boolean() }),
  }),
  preferredModel: z.enum(["luna", "sol"]),
  evaluation: z.object({
    method: z.enum(["tests", "build", "typecheck", "human"]),
  }),
  requestPreview: z.string().optional(),
});

export type TrainingRecordBuilderOptions = {
  hmacKey: string;
  allowRequestPreview?: boolean;
  maxPreviewChars?: number;
  collectedAt?: string;
};

export function buildTrainingRecord(
  example: RoutingTrainingExample,
  options: TrainingRecordBuilderOptions,
): TrainingRecord | null {
  const parsedExample = routingTrainingExampleSchema.strict().safeParse(example);
  if (!parsedExample.success || !options.hmacKey || !example.request.trim() || !Number.isFinite(Date.parse(options.collectedAt ?? ""))) {
    return null;
  }

  const request = redactTrainingText(parsedExample.data.request);
  if (!request) {
    return null;
  }

  const record: TrainingRecord = {
    schemaVersion: 2,
    collectedAt: options.collectedAt!,
    requestId: createHmac("sha256", options.hmacKey).update(example.request).digest("hex"),
    features: summarizeTrainingFeatures(request),
    results: parsedExample.data.results,
    preferredModel: parsedExample.data.preferredModel,
    evaluation: parsedExample.data.evaluation,
  };

  if (options.allowRequestPreview) {
    const preview = request.slice(0, options.maxPreviewChars ?? 500);
    if (preview) {
      record.requestPreview = preview;
    }
  }

  return record;
}

export function redactTrainingText(text: string): string {
  return text
    .replace(/\bBearer\s+[^\s"',;]+/giu, "Bearer [REDACTED]")
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\n]+/giu, "$&".replace(/[^:]+$/, "[REDACTED]"))
    .replace(/\b(?:oauth[_ -]?code|code|token|api[_ -]?key|password|secret)\s*[:=]\s*["']?[^\s"',;]+/giu, "$1=[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "[REDACTED]")
    .replace(/[A-Z]:\\Users\\([^\\/\s]+)/giu, "[LOCAL_PATH]")
    .replace(/\/(?:Users|home)\/[^/\s]+/giu, "[LOCAL_PATH]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[REDACTED_EMAIL]")
    .trim();
}

function extractRoutingFeatures(request: string): Record<string, number> {
  const text = request.toLowerCase();
  const signals: Record<string, string[]> = {
    risk: ["race condition", "deadlock", "concurrency", "security audit", "security analysis"],
    architecture: ["architecture", "redesign", "large refactor"],
    scope: ["multiple modules", "cross-module", "repository-wide", "entire repo"],
    diagnostics: ["debugging"],
    codeBlock: ["```"],
    stackTrace: ["stack trace"],
    logs: ["logs", "error", "warning"],
    typoFix: ["typo"],
    formatting: ["format", "prettier"],
  };
  return Object.fromEntries(Object.entries(signals).filter(([, values]) => values.some((value) => text.includes(value))).map(([name]) => [name, 1]));
}

export function summarizeTrainingFeatures(request: string): TrainingRecord["features"] {
  return {
    charCount: request.length,
    lineCount: request.split(/\r?\n/u).length,
    wordCount: request.match(/\S+/gu)?.length ?? 0,
    codeBlockCount: Math.floor((request.match(/```/gu)?.length ?? 0) / 2),
    listItemCount: request.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/gmu)?.length ?? 0,
    hasErrorSignal: /\b(?:error|exception|failed|failure|stack trace)\b/iu.test(request),
    hasPathSignal: /(?:[A-Z]:\\|\/(?:Users|home)\/|\b\w+[\\/]\w+)/u.test(request),
    routingFeatures: extractRoutingFeatures(request),
  };
}






