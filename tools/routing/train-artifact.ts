import { readFile } from "node:fs/promises";
import { adaptTrainingRecord } from "./dataset-adapter.js";
import { createModelArtifact, writeModelArtifactAtomic } from "./model-artifact.js";
import { trainRoutingModel } from "./train.js";

type DatasetFile = { manifest: { recordCount: number; source: string }; splits: { train: unknown[] } };

function option(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

export async function trainArtifact(args: string[]): Promise<void> {
  const datasetPath = option(args, "--dataset");
  const outputPath = option(args, "--output");
  if (!datasetPath || !outputPath) throw new Error("Usage: train-artifact --dataset dataset.json --output routing-model.json");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as DatasetFile;
  const epochs = Number(option(args, "--epochs", "10"));
  const learningRate = Number(option(args, "--learning-rate", "1"));
  const records = dataset.splits.train as import("../../src/router/training-record-builder.js").TrainingRecord[];
  if (!records.length) throw new Error("Training split is empty");
  const model = trainRoutingModel(records.map(adaptTrainingRecord), { epochs, learningRate });
  await writeModelArtifactAtomic(outputPath, createModelArtifact(model, {
    modelVersion: option(args, "--model-version", `routing-${Date.now()}`)!,
    datasetVersion: dataset.manifest.source,
    epochs,
    learningRate,
  }));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/train-artifact.ts")) {
  trainArtifact(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
