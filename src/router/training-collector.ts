import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { RoutingTrainingExample } from "./training-example.js";
import { buildTrainingRecord, type TrainingRecord } from "./training-record-builder.js";

export type TrainingCollectorOptions = {
  enabled?: boolean;
  filePath?: string;
  maxRecordBytes?: number;
  minIntervalMs?: number;
  retentionDays?: number;
  hmacKey?: string;
  allowRequestPreview?: boolean;
  maxPreviewChars?: number;
  maxRequestChars?: number;
};

const defaultMaxRecordBytes = 64 * 1024;
const defaultRetentionDays = 30;

export class RoutingTrainingCollector {
  private readonly enabled: boolean;
  private readonly filePath: string;
  private readonly maxRecordBytes: number;
  private readonly minIntervalMs: number;
  private readonly retentionDays: number;
  private readonly hmacKey: string;
  private readonly allowRequestPreview: boolean;
  private readonly maxPreviewChars: number;
  private lastWriteAt = 0;

  constructor(options: TrainingCollectorOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.filePath = resolve(options.filePath ?? join(homedir(), ".switchlm", "routing-training.jsonl"));
    this.maxRecordBytes = options.maxRecordBytes ?? defaultMaxRecordBytes;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.retentionDays = options.retentionDays ?? defaultRetentionDays;
    this.hmacKey = options.hmacKey ?? process.env.SWITCHLM_TRAINING_HMAC_KEY ?? "";
    this.allowRequestPreview = options.allowRequestPreview ?? false;
    this.maxPreviewChars = options.maxPreviewChars ?? options.maxRequestChars ?? 500;
  }

  async record(example: RoutingTrainingExample, now = Date.now()): Promise<boolean> {
    if (!this.enabled || now - this.lastWriteAt < this.minIntervalMs) {
      return false;
    }

    const record = buildTrainingRecord(example, {
      hmacKey: this.hmacKey,
      allowRequestPreview: this.allowRequestPreview,
      maxPreviewChars: this.maxPreviewChars,
      collectedAt: new Date(now).toISOString(),
    });
    if (!record) {
      return false;
    }

    const line = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(line, "utf8") > this.maxRecordBytes) {
      return false;
    }

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
        const record = JSON.parse(line) as Partial<TrainingRecord>;
        return typeof record.collectedAt === "string" && Date.parse(record.collectedAt) >= cutoff;
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


