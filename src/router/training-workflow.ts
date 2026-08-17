import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { TrainingQueue, type TrainingQueueStatus } from "./training-queue.js";
import { parseRoutingObservation, type RoutingObservation } from "./training-observation.js";
import { readFile } from "node:fs/promises";

export type TrainingWorkflowPaths = {
  queueFilePath?: string;
  observationFilePath: string;
};

export type TrainingWorkflowStatus = {
  paths: TrainingWorkflowPaths & { queueFilePath: string };
  queue: Record<TrainingQueueStatus, number>;
  observations: {
    total: number;
    succeeded: number;
    failed: number;
    lastCollectedAt?: string;
  };
};

export async function initializeTrainingStorage(paths: TrainingWorkflowPaths): Promise<TrainingWorkflowStatus["paths"]> {
  const queue = new TrainingQueue({ filePath: paths.queueFilePath });
  const resolvedPaths = {
    queueFilePath: queue.path,
    observationFilePath: paths.observationFilePath,
  };
  await mkdir(dirname(resolvedPaths.queueFilePath), { recursive: true });
  await mkdir(dirname(resolvedPaths.observationFilePath), { recursive: true });
  return resolvedPaths;
}

export async function readTrainingWorkflowStatus(paths: TrainingWorkflowPaths): Promise<TrainingWorkflowStatus> {
  const queue = new TrainingQueue({ filePath: paths.queueFilePath });
  const entries = await queue.list();
  const queueStatus = {
    pending: 0,
    evaluated: 0,
    rejected: 0,
    included: 0,
  } satisfies Record<TrainingQueueStatus, number>;
  for (const entry of entries) queueStatus[entry.status] += 1;

  const observations = await readObservations(paths.observationFilePath);
  return {
    paths: { queueFilePath: queue.path, observationFilePath: paths.observationFilePath },
    queue: queueStatus,
    observations: {
      total: observations.length,
      succeeded: observations.filter((observation) => observation.success).length,
      failed: observations.filter((observation) => !observation.success).length,
      lastCollectedAt: observations.at(-1)?.collectedAt,
    },
  };
}

export async function readTrainingReport(paths: TrainingWorkflowPaths): Promise<TrainingWorkflowStatus> {
  return readTrainingWorkflowStatus(paths);
}

async function readObservations(filePath: string): Promise<RoutingObservation[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  return content.split("\n").filter(Boolean).flatMap((line) => {
    try {
      return [parseRoutingObservation(JSON.parse(line))];
    } catch {
      return [];
    }
  });
}
