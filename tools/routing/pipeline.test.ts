import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDataset, type DatasetRecord } from "./dataset.js";
import { adaptTrainingRecord } from "./dataset-adapter.js";
import { createModelArtifact, routingModelArtifactSchema } from "./model-artifact.js";
import { trainRoutingModel } from "./train.js";
import { evaluatePairwise } from "./evaluate-pairwise.js";

function record(id: string, preferredModel: "luna" | "sol"): DatasetRecord {
  return {
    schemaVersion: 2 as const,
    collectedAt: "2026-08-17T00:00:00.000Z",
    requestId: id,
    features: { charCount: 10, lineCount: 1, wordCount: 2, codeBlockCount: 0, listItemCount: 0, hasErrorSignal: false, hasPathSignal: false, routingFeatures: preferredModel === "sol" ? { risk: 1 } as Record<string, number> : { typoFix: 1 } as Record<string, number> },
    results: { luna: { score: preferredModel === "luna" ? 1 : 0, passed: preferredModel === "luna" }, sol: { score: preferredModel === "sol" ? 1 : 0, passed: preferredModel === "sol" } },
    preferredModel,
    evaluation: { method: "human" as const },
  };
}

describe("training pipeline smoke", () => {
  it("builds a normalized dataset and versioned model artifact", () => {
    const dataset = buildDataset([record("a", "luna"), record("b", "sol")], { source: "smoke-dataset", policyVersion: "policy-1", ratios: { train: 1, validation: 0, test: 0 } });
    const model = trainRoutingModel(dataset.splits.train.map(adaptTrainingRecord));
    const artifact = createModelArtifact(model, { modelVersion: "smoke-model", datasetVersion: dataset.manifest.source, epochs: 2, learningRate: 1 });

    expect(routingModelArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(model.weights).toEqual(expect.any(Object));
  });

  it("turns explicit quality evidence into labelled normalized records", async () => {
    const directory = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? ".", "switchlm-pipeline-"));
    const input = join(directory, "evidence.jsonl");
    const output = join(directory, "records.jsonl");
    await writeFile(input, `${JSON.stringify({ inputId: "one", requestId: "hmac-one", collectedAt: "2026-08-17T00:00:00.000Z", routingFeatures: { risk: 1 }, evidence: { luna: { method: "tests", status: "failed" }, sol: { method: "tests", status: "passed" } } })}\n`, "utf8");

    expect(await evaluatePairwise(input, output)).toBe(1);
    const saved = JSON.parse((await readFile(output, "utf8")).trim());
    expect(saved).toMatchObject({ schemaVersion: 2, requestId: "hmac-one", preferredModel: "sol" });
    expect(saved).not.toHaveProperty("request");
  });
});

