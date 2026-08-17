import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrainingQueue } from "./training-queue.js";
import { TrainingWorker } from "./training-worker.js";

function record(index: number) {
  return {
    schemaVersion: 2 as const,
    collectedAt: "2026-08-17T10:00:00.000Z",
    requestId: index.toString(16).padStart(64, "0"),
    features: {
      charCount: 10,
      lineCount: 1,
      wordCount: 2,
      codeBlockCount: 0,
      listItemCount: 0,
      hasErrorSignal: false,
      hasPathSignal: false,
      routingFeatures: {},
    },
    results: {
      luna: { score: 0.6, passed: false },
      sol: { score: 0.9, passed: true },
    },
    preferredModel: "sol" as const,
    evaluation: { method: "human" as const },
  };
}

async function queueWithRecords(directory: string, count: number) {
  const queue = new TrainingQueue({ filePath: join(directory, "queue.json") });
  for (let index = 0; index < count; index += 1) await queue.enqueue(record(index));
  return queue;
}

describe("TrainingWorker", () => {
  it("skips below the minimum pending threshold", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-worker-"));
    const queue = await queueWithRecords(directory, 1);
    const worker = new TrainingWorker({ queue, minPendingRecords: 2 });

    await expect(worker.run(async () => ({ status: "evaluated" }))).resolves.toMatchObject({
      status: "skipped",
      reason: "below-threshold",
      pending: 1,
    });
  });

  it("retries evaluator failures and transitions results", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-worker-"));
    const queue = await queueWithRecords(directory, 2);
    const worker = new TrainingWorker({ queue, minPendingRecords: 2, maxRetries: 1 });
    let attempts = 0;

    const result = await worker.run(async (entry) => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary failure");
      return { status: entry.record.requestId.endsWith("1") ? "rejected" : "evaluated", reason: "checked" };
    });

    expect(result).toMatchObject({ status: "processed", evaluated: 1, rejected: 1, retries: 1 });
    expect((await queue.list("evaluated"))).toHaveLength(1);
    expect((await queue.list("rejected"))).toHaveLength(1);
  });

  it("honors an active lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-worker-"));
    const queue = await queueWithRecords(directory, 2);
    const lockPath = join(directory, "worker.lock");
    await writeFile(lockPath, "active", "utf8");
    const worker = new TrainingWorker({ queue, lockPath, minPendingRecords: 1 });

    await expect(worker.run(async () => ({ status: "evaluated" }))).resolves.toMatchObject({ status: "skipped", reason: "locked" });
  });
});
