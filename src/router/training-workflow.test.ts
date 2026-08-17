import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TrainingObservationCollector } from "./training-observation.js";
import { initializeTrainingStorage, readTrainingWorkflowStatus } from "./training-workflow.js";

describe("training workflow", () => {
  it("initializes storage and reports runtime observations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "switchlm-workflow-"));
    const queueFilePath = join(directory, "queue", "training.json");
    const observationFilePath = join(directory, "observations", "runtime.jsonl");

    await initializeTrainingStorage({ queueFilePath, observationFilePath });
    const collector = new TrainingObservationCollector({ enabled: true, filePath: observationFilePath, hmacKey: "test-key", minIntervalMs: 0 });
    await collector.record({
      input: "Fix the race condition",
      requestedModel: "router/auto",
      decision: { target: "sol", score: 5, reasons: ["race condition"] },
      success: true,
      latencyMs: 10,
    }, 1_000);

    const status = await readTrainingWorkflowStatus({ queueFilePath, observationFilePath });
    expect(status.queue).toEqual({ pending: 0, evaluated: 0, rejected: 0, included: 0 });
    expect(status.observations).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
    await expect(readFile(queueFilePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
