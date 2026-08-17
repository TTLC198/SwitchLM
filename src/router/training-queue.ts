import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { trainingRecordSchema, type TrainingRecord } from "./training-record-builder.js";

export const trainingQueueStatusSchema = z.enum(["pending", "evaluated", "rejected", "included"]);
export type TrainingQueueStatus = z.infer<typeof trainingQueueStatusSchema>;

const trainingQueueEntrySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/u),
  status: trainingQueueStatusSchema,
  record: trainingRecordSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reason: z.string().min(1).optional(),
});

const trainingQueueFileSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(trainingQueueEntrySchema),
});

export type TrainingQueueEntry = z.infer<typeof trainingQueueEntrySchema>;

export type TrainingQueueOptions = {
  filePath?: string;
  maxEntries?: number;
};

export class TrainingQueue {
  private readonly filePath: string;
  private readonly maxEntries: number;

  constructor(options: TrainingQueueOptions = {}) {
    this.filePath = resolve(options.filePath ?? join(homedir(), ".switchlm", "routing-training-queue.json"));
    this.maxEntries = options.maxEntries ?? 10_000;
    if (!Number.isInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new Error("Training queue maxEntries must be a positive integer");
    }
  }

  get path(): string {
    return this.filePath;
  }

  async list(status?: TrainingQueueStatus): Promise<TrainingQueueEntry[]> {
    const entries = (await this.read()).entries;
    return status ? entries.filter((entry) => entry.status === status) : entries;
  }

  async enqueue(record: TrainingRecord, now = Date.now()): Promise<TrainingQueueEntry> {
    const parsedRecord = trainingRecordSchema.parse(record);
    const timestamp = new Date(now).toISOString();
    const id = createHash("sha256").update(JSON.stringify(parsedRecord)).digest("hex").slice(0, 32);
    const queue = await this.read();
    const existing = queue.entries.find((entry) => entry.id === id);
    if (existing) return existing;
    if (queue.entries.length >= this.maxEntries) {
      throw new Error("Training queue is full");
    }

    const entry: TrainingQueueEntry = {
      id,
      status: "pending",
      record: parsedRecord,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    queue.entries.push(entry);
    await this.write(queue);
    return entry;
  }

  async transition(
    id: string,
    status: TrainingQueueStatus,
    reason?: string,
    now = Date.now(),
  ): Promise<TrainingQueueEntry> {
    const queue = await this.read();
    const entry = queue.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Training queue entry not found: ${id}`);
    if (!canTransition(entry.status, status)) {
      throw new Error(`Invalid training queue transition: ${entry.status} -> ${status}`);
    }
    if (status === "rejected" && !reason?.trim()) {
      throw new Error("Rejected training queue entries require a reason");
    }

    entry.status = status;
    entry.updatedAt = new Date(now).toISOString();
    if (reason?.trim()) entry.reason = reason.trim();
    await this.write(queue);
    return entry;
  }

  async prune(retentionDays: number, now = Date.now()): Promise<number> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error("Training queue retentionDays must be a positive integer");
    }
    const queue = await this.read();
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1_000;
    const retained = queue.entries.filter((entry) =>
      entry.status === "pending"
      || entry.status === "evaluated"
      || Date.parse(entry.updatedAt) >= cutoff,
    );
    const removed = queue.entries.length - retained.length;
    if (removed > 0) await this.write({ schemaVersion: 1, entries: retained });
    return removed;
  }

  private async read(): Promise<{ schemaVersion: 1; entries: TrainingQueueEntry[] }> {
    try {
      return trainingQueueFileSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { schemaVersion: 1, entries: [] };
      }
      throw new Error(`Invalid training queue file: ${this.filePath}`, { cause: error });
    }
  }

  private async write(queue: { schemaVersion: 1; entries: TrainingQueueEntry[] }): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function canTransition(from: TrainingQueueStatus, to: TrainingQueueStatus): boolean {
  return (from === "pending" && (to === "evaluated" || to === "rejected"))
    || (from === "evaluated" && (to === "included" || to === "rejected"));
}
