import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RoutingTrainingCollector } from "./training-collector.js";

const example = {
  schemaVersion: 1,
  request: "Run the tests.",
  results: {
    luna: { score: 0.6, passed: false },
    sol: { score: 0.9, passed: true },
  },
  preferredModel: "sol",
  evaluation: { method: "tests" },
} as const;

describe("RoutingTrainingCollector", () => {
  it("does not write when disabled", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-training-"));
    const filePath = join(directory, "records.jsonl");

    const written = await new RoutingTrainingCollector({ enabled: false, filePath }).record(example, 1_000);

    expect(written).toBe(false);
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("redacts secrets, truncates requests, and rate-limits writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-training-"));
    const filePath = join(directory, "records.jsonl");
    const collector = new RoutingTrainingCollector({
      enabled: true,
      filePath,
      hmacKey: "test-key",
      allowRequestPreview: true,
      maxRequestChars: 40,
      minIntervalMs: 1_000,
    });

    const request = "Bearer bearer-secret token=token-secret sk-live-secret with extra context";
    expect(await collector.record({ ...example, request }, 1_000)).toBe(true);
    expect(await collector.record({ ...example, request }, 1_500)).toBe(false);
    expect(await collector.record({ ...example, request }, 2_000)).toBe(true);

    const records = (await readFile(filePath, "utf8")).trim().split("\n");
    expect(records).toHaveLength(2);
    expect(records[0]).not.toContain("bearer-secret");
    expect(records[0]).not.toContain("token-secret");
    expect(records[0]).not.toContain("sk-live-secret");
    expect(JSON.parse(records[0]).requestPreview).toHaveLength(40);
  });

  it("skips records larger than the configured limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-training-"));
    const filePath = join(directory, "records.jsonl");
    const collector = new RoutingTrainingCollector({ enabled: true, filePath, maxRecordBytes: 10 });

    expect(await collector.record(example, 1_000)).toBe(false);
    await expect(readFile(filePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

