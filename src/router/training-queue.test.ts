import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrainingQueue } from "./training-queue.js";

const record = {
  schemaVersion: 2,
  collectedAt: "2026-08-17T10:00:00.000Z",
  requestId: "a".repeat(64),
  features: {
    charCount: 12,
    lineCount: 1,
    wordCount: 2,
    codeBlockCount: 0,
    listItemCount: 0,
    hasErrorSignal: false,
    hasPathSignal: false,
    routingFeatures: {},
  },
  results: {
    luna: { score: 0.8, passed: true },
    sol: { score: 0.9, passed: true },
  },
  preferredModel: "sol",
  evaluation: { method: "human" },
} as const;

describe("TrainingQueue", () => {
  it("stores records and enforces the lifecycle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-queue-"));
    const queue = new TrainingQueue({ filePath: join(directory, "queue.json") });

    const first = await queue.enqueue(record, Date.parse("2026-08-17T10:01:00.000Z"));
    const duplicate = await queue.enqueue(record, Date.parse("2026-08-17T10:02:00.000Z"));
    expect(duplicate).toEqual(first);
    expect(await queue.list("pending")).toHaveLength(1);

    await queue.transition(first.id, "evaluated", undefined, Date.parse("2026-08-17T10:03:00.000Z"));
    await queue.transition(first.id, "included", "accepted", Date.parse("2026-08-17T10:04:00.000Z"));
    expect((await queue.list("included"))[0]?.reason).toBe("accepted");
    await expect(queue.transition(first.id, "pending")).rejects.toThrow("Invalid training queue transition");
  });

  it("requires a rejection reason and rejects invalid files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-queue-"));
    const filePath = join(directory, "queue.json");
    const queue = new TrainingQueue({ filePath });
    const entry = await queue.enqueue(record);

    await expect(queue.transition(entry.id, "rejected")).rejects.toThrow("require a reason");
    await writeFile(filePath, "not-json", "utf8");
    await expect(queue.list()).rejects.toThrow("Invalid training queue file");
  });
});
