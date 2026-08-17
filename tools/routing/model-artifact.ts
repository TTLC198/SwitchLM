import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { RoutingModel } from "./model-schema.js";

export const routingModelArtifactSchema = z.object({
  schemaVersion: z.literal(2),
  modelVersion: z.string().min(1),
  datasetVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  trainingConfig: z.object({ epochs: z.number().int().positive(), learningRate: z.number().positive() }),
  model: z.object({ schemaVersion: z.literal(1), threshold: z.number().finite(), bias: z.number().finite(), weights: z.record(z.string(), z.number().finite()) }),
});

export type RoutingModelArtifact = z.infer<typeof routingModelArtifactSchema>;

export async function writeModelArtifactAtomic(path: string, artifact: RoutingModelArtifact): Promise<void> {
  const parsed = routingModelArtifactSchema.parse(artifact);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export function createModelArtifact(
  model: RoutingModel,
  options: { modelVersion: string; datasetVersion: string; epochs: number; learningRate: number; createdAt?: string },
): RoutingModelArtifact {
  return routingModelArtifactSchema.parse({
    schemaVersion: 2,
    modelVersion: options.modelVersion,
    datasetVersion: options.datasetVersion,
    createdAt: options.createdAt ?? new Date().toISOString(),
    trainingConfig: { epochs: options.epochs, learningRate: options.learningRate },
    model,
  });
}
