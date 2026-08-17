import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { TrainingRecord } from "../../src/router/training-record-builder.js";
import type { TrainingInput } from "./train.js";

const recordSchema = z.object({
  schemaVersion: z.literal(2),
  requestId: z.string().min(1),
  collectedAt: z.string().datetime(),
  preferredModel: z.enum(["luna", "sol"]),
  features: z.object({ routingFeatures: z.record(z.string(), z.number().finite()) }),
});

export function adaptTrainingRecord(record: TrainingRecord): TrainingInput {
  return {
    preferredModel: record.preferredModel,
    routingFeatures: record.features.routingFeatures,
  };
}

export async function loadNormalizedRecords(path: string): Promise<TrainingRecord[]> {
  const lines = (await readFile(path, "utf8")).split(/\r?\n/u).filter(Boolean);
  return lines.map((line) => recordSchema.parse(JSON.parse(line)) as TrainingRecord);
}

export async function loadTrainingInputs(path: string): Promise<TrainingInput[]> {
  return (await loadNormalizedRecords(path)).map(adaptTrainingRecord);
}
