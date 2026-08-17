import { createHmac } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { RoutingDecision } from "./routing-strategy.js";
import { redactTrainingText, summarizeTrainingFeatures } from "./training-record-builder.js";

export const routingObservationSchema = z.object({
  schemaVersion: z.literal(1),
  collectedAt: z.string().datetime(),
  requestId: z.string().regex(/^[a-f0-9]{64}$/u),
  requestedModel: z.string().min(1),
  selectedModel: z.enum(["luna", "sol"]),
  score: z.number().finite(),
  reasons: z.array(z.string().min(1).max(160)).max(20),
  success: z.boolean(),
  latencyMs: z.number().finite().nonnegative(),
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
});

export type RoutingObservationInput = {
  input: unknown;
  requestedModel: string;
  decision: RoutingDecision;
  success: boolean;
  latencyMs: number;
};

export type RoutingObservation = z.infer<typeof routingObservationSchema>;

export function parseRoutingObservation(input: unknown): RoutingObservation {
  return routingObservationSchema.parse(input);
}

export type TrainingObservationCollectorOptions = {
  enabled?: boolean;
  filePath?: string;
  maxRecordBytes?: number;
  minIntervalMs?: number;
  retentionDays?: number;
  hmacKey?: string;
};

export class TrainingObservationCollector {
  private readonly enabled: boolean;
  private readonly filePath: string;
  private readonly maxRecordBytes: number;
  private readonly minIntervalMs: number;
  private readonly retentionDays: number;
  private readonly hmacKey: string;
  private lastWriteAt = 0;

  constructor(options: TrainingObservationCollectorOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.filePath = resolve(options.filePath ?? join(homedir(), ".switchlm", "routing-observations.jsonl"));
    this.maxRecordBytes = options.maxRecordBytes ?? 64 * 1024;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.retentionDays = options.retentionDays ?? 30;
    this.hmacKey = options.hmacKey ?? process.env.SWITCHLM_TRAINING_HMAC_KEY ?? "";
  }

  async record(observation: RoutingObservationInput, now = Date.now()): Promise<boolean> {
    if (!this.enabled || !this.hmacKey || now - this.lastWriteAt < this.minIntervalMs) return false;

    const text = redactTrainingText(textFromInput(observation.input)).slice(0, 12_000);
    if (!text) return false;
    const record: RoutingObservation = {
      schemaVersion: 1,
      collectedAt: new Date(now).toISOString(),
      requestId: createHmac("sha256", this.hmacKey).update(text).digest("hex"),
      requestedModel: observation.requestedModel,
      selectedModel: observation.decision.target,
      score: observation.decision.score,
      reasons: observation.decision.reasons.map((reason) => reason.slice(0, 160)).filter(Boolean).slice(0, 20),
      success: observation.success,
      latencyMs: observation.latencyMs,
      features: summarizeTrainingFeatures(text),
    };
    const line = `${JSON.stringify(routingObservationSchema.parse(record))}\n`;
    if (Buffer.byteLength(line, "utf8") > this.maxRecordBytes) return false;

    await mkdir(dirname(this.filePath), { recursive: true });
    await this.cleanup(now);
    await appendFile(this.filePath, line, "utf8");
    this.lastWriteAt = now;
    return true;
  }

  private async cleanup(now: number): Promise<void> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }

    const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1_000;
    const retained = content.split("\n").filter((line) => {
      if (!line.trim()) return false;
      try {
        const record = routingObservationSchema.parse(JSON.parse(line));
        return Date.parse(record.collectedAt) >= cutoff;
      } catch {
        return false;
      }
    });
    const cleaned = retained.length ? `${retained.join("\n")}\n` : "";
    if (cleaned !== content) {
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, cleaned, "utf8");
      await rename(temporaryPath, this.filePath);
    }
  }
}

function textFromInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    for (const item of [...input].reverse()) {
      if (!item || typeof item !== "object" || !("role" in item) || item.role !== "user") continue;
      const content = "content" in item ? item.content : "";
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((part): part is { text: string } => !!part && typeof part === "object" && "text" in part && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n");
      }
    }
  }
  return "";
}
