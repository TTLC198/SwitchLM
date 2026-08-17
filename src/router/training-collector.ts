import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { RoutingTrainingExample } from "./training-example.js";
import { serializeRoutingTrainingExample } from "./training-example.js";

export type TrainingCollectorOptions = {
  enabled?: boolean;
  filePath?: string;
  maxRecordBytes?: number;
  minIntervalMs?: number;
  maxRequestChars?: number;
};

const defaultMaxRecordBytes = 64 * 1024;
const defaultMaxRequestChars = 2_000;

export class RoutingTrainingCollector {
  private readonly enabled: boolean;
  private readonly filePath: string;
  private readonly maxRecordBytes: number;
  private readonly minIntervalMs: number;
  private readonly maxRequestChars: number;
  private lastWriteAt = 0;

  constructor(options: TrainingCollectorOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.filePath = resolve(options.filePath ?? join(homedir(), ".switchlm", "routing-training.jsonl"));
    this.maxRecordBytes = options.maxRecordBytes ?? defaultMaxRecordBytes;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.maxRequestChars = options.maxRequestChars ?? defaultMaxRequestChars;
  }

  async record(example: RoutingTrainingExample, now = Date.now()): Promise<boolean> {
    if (!this.enabled || now - this.lastWriteAt < this.minIntervalMs) {
      return false;
    }

    const sanitized = sanitizeTrainingExample(example, this.maxRequestChars);
    const line = `${serializeRoutingTrainingExample(sanitized)}\n`;

    if (Buffer.byteLength(line, "utf8") > this.maxRecordBytes) {
      return false;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, line, "utf8");
    this.lastWriteAt = now;
    return true;
  }
}

function sanitizeTrainingExample(example: RoutingTrainingExample, maxRequestChars: number): RoutingTrainingExample {
  return {
    ...example,
    request: redactSecrets(example.request).slice(0, maxRequestChars),
  };
}

function redactSecrets(request: string): string {
  return request
    .replace(/\bBearer\s+[^\s"',;]+/giu, "Bearer [REDACTED]")
    .replace(/\b(bearer|token|api[_-]?key|password|secret)\s*[:=]\s*["']?[^\s"',;]+/giu, "$1=[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+/gu, "[REDACTED]");
}
