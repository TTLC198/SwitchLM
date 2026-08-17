import { mkdir, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import type { TrainingRecord } from "../../src/router/training-record-builder.js";

export type DatasetRecord = TrainingRecord & { sessionId?: string };
export type DatasetSplitName = "train" | "validation" | "test";
export type DatasetSplits = Record<DatasetSplitName, DatasetRecord[]>;

export type DatasetManifest = {
  schemaVersion: 1;
  recordCount: number;
  source: string;
  collectedAt: string;
  policyVersion: string;
  splitCounts: Record<DatasetSplitName, number>;
};

export type DatasetBundle = {
  manifest: DatasetManifest;
  splits: DatasetSplits;
};

export type DatasetOptions = {
  source: string;
  policyVersion: string;
  collectedAt?: string;
  ratios?: { train: number; validation: number; test: number };
  minSplitSize?: number;
  requireBalanced?: boolean;
};

export type DatasetValidation = {
  valid: boolean;
  errors: string[];
  counts: Record<DatasetSplitName, { total: number; luna: number; sol: number }>;
};

const defaultRatios = { train: 0.8, validation: 0.1, test: 0.1 } as const;
const splitNames: DatasetSplitName[] = ["train", "validation", "test"];

export function buildDataset(records: readonly DatasetRecord[], options: DatasetOptions): DatasetBundle {
  const deduplicated = deduplicateRecords(records);
  const splits = splitRecords(deduplicated, options.ratios ?? defaultRatios);
  const validation = validateDatasetSplits(splits, {
    minSplitSize: options.minSplitSize ?? 0,
    requireBalanced: options.requireBalanced ?? false,
  });
  if (!validation.valid) {
    throw new Error(`Invalid dataset: ${validation.errors.join("; ")}`);
  }

  const collectedAt = options.collectedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(collectedAt))) throw new Error("collectedAt must be an ISO date");
  return {
    manifest: {
      schemaVersion: 1,
      recordCount: deduplicated.length,
      source: options.source,
      collectedAt,
      policyVersion: options.policyVersion,
      splitCounts: Object.fromEntries(splitNames.map((name) => [name, splits[name].length])) as DatasetManifest["splitCounts"],
    },
    splits,
  };
}

export function deduplicateRecords(records: readonly DatasetRecord[]): DatasetRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.requestId || seen.has(record.requestId)) return false;
    seen.add(record.requestId);
    return true;
  });
}

export function splitRecords(
  records: readonly DatasetRecord[],
  ratios: { train: number; validation: number; test: number } = defaultRatios,
): DatasetSplits {
  validateRatios(ratios);
  const groups = new Map<string, DatasetRecord[]>();
  for (const record of records) {
    const group = record.sessionId ?? record.requestId;
    groups.set(group, [...(groups.get(group) ?? []), record]);
  }

  const splits: DatasetSplits = { train: [], validation: [], test: [] };
  for (const [groupId, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const bucket = hashToUnitInterval(groupId);
    const target = bucket < ratios.train ? "train" : bucket < ratios.train + ratios.validation ? "validation" : "test";
    splits[target].push(...group);
  }
  return splits;
}

export function validateDatasetSplits(
  splits: DatasetSplits,
  options: { minSplitSize?: number; requireBalanced?: boolean } = {},
): DatasetValidation {
  const errors: string[] = [];
  const counts = Object.fromEntries(splitNames.map((name) => {
    const split = splits[name] ?? [];
    const luna = split.filter((record) => record.preferredModel === "luna").length;
    return [name, { total: split.length, luna, sol: split.length - luna }];
  })) as DatasetValidation["counts"];

  for (const name of splitNames) {
    if (counts[name].total < (options.minSplitSize ?? 0)) errors.push(`${name} split is smaller than minimum size`);
    if (options.requireBalanced && counts[name].total > 0 && Math.min(counts[name].luna, counts[name].sol) === 0) {
      errors.push(`${name} split has only one preferred model`);
    }
  }
  return { valid: errors.length === 0, errors, counts };
}

export async function writeDatasetAtomic(path: string, dataset: DatasetBundle): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

function validateRatios(ratios: { train: number; validation: number; test: number }): void {
  const total = ratios.train + ratios.validation + ratios.test;
  if (![ratios.train, ratios.validation, ratios.test].every((value) => Number.isFinite(value) && value >= 0) || Math.abs(total - 1) > 1e-9) {
    throw new Error("split ratios must be non-negative and sum to 1");
  }
}

function hashToUnitInterval(value: string): number {
  const digest = createHash("sha256").update(value).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}
