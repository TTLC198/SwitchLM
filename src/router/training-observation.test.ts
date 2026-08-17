import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrainingObservationCollector } from "./training-observation.js";

describe("TrainingObservationCollector", () => {
  it("stores only normalized features and redacts the input", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-observation-"));
    const filePath = join(directory, "observations.jsonl");
    const collector = new TrainingObservationCollector({ enabled: true, filePath, hmacKey: "test-key", minIntervalMs: 0 });

    const written = await collector.record({
      input: [{ role: "user", content: "Fix token: sk-secret and C:\\Users\\alice\\repo" }],
      requestedModel: "router/auto",
      decision: { target: "sol", score: 5, reasons: ["security analysis"] },
      success: true,
      latencyMs: 42,
    }, 1_000);

    expect(written).toBe(true);
    const content = await readFile(filePath, "utf8");
    expect(content).not.toContain("sk-secret");
    expect(content).not.toContain("Users\\alice");
    expect(content).toContain('"selectedModel":"sol"');
    expect(content).not.toContain("Fix token");
  });
});
