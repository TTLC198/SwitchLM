import { open, rm, stat } from "node:fs/promises";
import type { TrainingQueueEntry } from "./training-queue.js";
import { TrainingQueue } from "./training-queue.js";

export type TrainingWorkerEvaluation = {
  status: "evaluated" | "rejected";
  reason?: string;
};

export type TrainingWorkerOptions = {
  queue: TrainingQueue;
  lockPath?: string;
  minPendingRecords?: number;
  maxRetries?: number;
  retentionDays?: number;
  staleLockMs?: number;
};

export type TrainingWorkerResult = {
  status: "processed" | "skipped";
  reason?: "locked" | "below-threshold" | "empty";
  pending: number;
  evaluated: number;
  rejected: number;
  retries: number;
  pruned: number;
};

export type TrainingWorkerEvaluator = (entry: TrainingQueueEntry) => Promise<TrainingWorkerEvaluation>;

export class TrainingWorker {
  private readonly queue: TrainingQueue;
  private readonly lockPath: string;
  private readonly minPendingRecords: number;
  private readonly maxRetries: number;
  private readonly retentionDays: number;
  private readonly staleLockMs: number;

  constructor(options: TrainingWorkerOptions) {
    this.queue = options.queue;
    this.lockPath = options.lockPath ?? `${options.queue.path}.lock`;
    this.minPendingRecords = options.minPendingRecords ?? 10;
    this.maxRetries = options.maxRetries ?? 2;
    this.retentionDays = options.retentionDays ?? 30;
    this.staleLockMs = options.staleLockMs ?? 15 * 60 * 1_000;
    if (!Number.isInteger(this.minPendingRecords) || this.minPendingRecords < 1) throw new Error("minPendingRecords must be positive");
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) throw new Error("maxRetries must be non-negative");
  }

  async run(evaluate: TrainingWorkerEvaluator, now = Date.now()): Promise<TrainingWorkerResult> {
    const lock = await this.acquireLock(now);
    if (!lock) {
      return { status: "skipped", reason: "locked", pending: 0, evaluated: 0, rejected: 0, retries: 0, pruned: 0 };
    }

    try {
      const pending = await this.queue.list("pending");
      const pruned = await this.queue.prune(this.retentionDays, now);
      if (pending.length === 0) {
        return { status: "skipped", reason: "empty", pending: 0, evaluated: 0, rejected: 0, retries: 0, pruned };
      }
      if (pending.length < this.minPendingRecords) {
        return { status: "skipped", reason: "below-threshold", pending: pending.length, evaluated: 0, rejected: 0, retries: 0, pruned };
      }

      let evaluated = 0;
      let rejected = 0;
      let retries = 0;
      for (const entry of pending) {
        let result: TrainingWorkerEvaluation | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
          try {
            result = await evaluate(entry);
            break;
          } catch (error) {
            lastError = error;
            if (attempt < this.maxRetries) retries += 1;
          }
        }
        if (!result) {
          await this.queue.transition(entry.id, "rejected", `worker failed: ${errorMessage(lastError)}`, now);
          rejected += 1;
        } else if (result.status === "evaluated") {
          await this.queue.transition(entry.id, "evaluated", result.reason, now);
          evaluated += 1;
        } else {
          await this.queue.transition(entry.id, "rejected", result.reason ?? "worker rejected record", now);
          rejected += 1;
        }
      }
      return { status: "processed", pending: pending.length, evaluated, rejected, retries, pruned };
    } finally {
      await rm(this.lockPath, { force: true });
    }
  }

  private async acquireLock(now: number): Promise<boolean> {
    try {
      const handle = await open(this.lockPath, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date(now).toISOString() }));
      await handle.close();
      return true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      try {
        const lockStats = await stat(this.lockPath);
        if (now - lockStats.mtimeMs > this.staleLockMs) {
          await rm(this.lockPath, { force: true });
          return this.acquireLock(now);
        }
      } catch (statError) {
        if (!(statError instanceof Error && "code" in statError && statError.code === "ENOENT")) throw statError;
      }
      return false;
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
