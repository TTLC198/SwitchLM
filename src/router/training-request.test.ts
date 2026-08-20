import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrainingRequestCollector } from "./training-request.js";

describe("TrainingRequestCollector", () => {
  it("does not write when collection is disabled or the HMAC key is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-requests-"));
    const filePath = join(directory, "requests.jsonl");
    const request = { input: "secret prompt" };

    await expect(new TrainingRequestCollector({ filePath, enabled: false, hmacKey: "key" }).record(request)).resolves.toBe(false);
    await expect(new TrainingRequestCollector({ filePath, enabled: true, hmacKey: "" }).record(request)).resolves.toBe(false);
  });

  it("writes the complete request in pairwise-compatible JSONL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-requests-"));
    const filePath = join(directory, "requests.jsonl");
    const request = { model: "router/auto", input: [{ role: "user", content: "full prompt" }], stream: false };
    const collector = new TrainingRequestCollector({ filePath, enabled: true, hmacKey: "key" });

    await expect(collector.record(request)).resolves.toBe(true);
    const record = JSON.parse(await readFile(filePath, "utf8")) as { id: string; requestId: string; request: typeof request };
    expect(record.id).toMatch(/^[a-f0-9]{64}$/u);
    expect(record.requestId).toBe(record.id);
    expect(record.request).toEqual(request);
  });

  it("rejects records larger than the configured limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-requests-"));
    const filePath = join(directory, "requests.jsonl");
    const collector = new TrainingRequestCollector({ filePath, enabled: true, hmacKey: "key", maxRequestBytes: 32 });

    await expect(collector.record({ input: "a prompt that is too large" })).resolves.toBe(false);
  });
});
