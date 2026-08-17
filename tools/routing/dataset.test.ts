import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrainingRecord } from "../../src/router/training-record-builder.js";
import { buildDataset, deduplicateRecords, splitRecords, validateDatasetSplits, writeDatasetAtomic } from "./dataset.js";

function record(requestId: string, preferredModel: "luna" | "sol", sessionId?: string): TrainingRecord & { sessionId?: string } {
  return {
    schemaVersion: 2,
    collectedAt: "2026-08-17T00:00:00.000Z",
    requestId,
    features: { charCount: 1, lineCount: 1, wordCount: 1, codeBlockCount: 0, listItemCount: 0, hasErrorSignal: false, hasPathSignal: false, routingFeatures: {} },
    results: { luna: { score: 0, passed: false }, sol: { score: 1, passed: true } },
    preferredModel,
    evaluation: { method: "human" },
    ...(sessionId ? { sessionId } : {}),
  };
}

describe("dataset", () => {
  it("deduplicates by HMAC request id", () => {
    expect(deduplicateRecords([record("a", "luna"), record("a", "sol"), record("b", "sol")])).toHaveLength(2);
  });

  it("keeps one session in one split and is deterministic", () => {
    const records = [record("a", "luna", "session-1"), record("b", "sol", "session-1"), record("c", "luna", "session-2")];
    const first = splitRecords(records, { train: 1, validation: 0, test: 0 });
    const second = splitRecords(records, { train: 1, validation: 0, test: 0 });
    expect(first).toEqual(second);
    expect(first.train.map((item) => item.sessionId)).toEqual(["session-1", "session-1", "session-2"]);
  });

  it("checks minimum size and Luna/Sol balance", () => {
    const splits = { train: [record("a", "luna")], validation: [record("b", "sol")], test: [] };
    const result = validateDatasetSplits(splits, { minSplitSize: 1, requireBalanced: true });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(["train split has only one preferred model", "test split is smaller than minimum size"]));
  });

  it("builds a versioned manifest and writes it atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-dataset-"));
    const path = join(directory, "dataset.json");
    const dataset = buildDataset([record("a", "luna")], {
      source: "test-fixture",
      policyVersion: "policy-1",
      collectedAt: "2026-08-17T00:00:00.000Z",
    });
    await writeDatasetAtomic(path, dataset);
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved.manifest).toMatchObject({ schemaVersion: 1, recordCount: 1, source: "test-fixture", policyVersion: "policy-1" });
  });
});

