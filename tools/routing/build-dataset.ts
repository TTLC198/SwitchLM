import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildDataset, type DatasetRecord } from "./dataset.js";

function option(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

export async function buildDatasetFromFile(args: string[]): Promise<void> {
  const input = option(args, "--input");
  const output = option(args, "--output");
  if (!input || !output) throw new Error("Usage: build-dataset --input records.jsonl --output dataset.json");
  const records = (await readFile(input, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as DatasetRecord);
  const dataset = buildDataset(records, {
    source: option(args, "--source", input)!,
    policyVersion: option(args, "--policy-version", "policy-1")!,
    minSplitSize: Number(option(args, "--min-split-size", "0")),
    requireBalanced: args.includes("--require-balanced"),
  });
  const temporaryPath = `${output}.tmp-${process.pid}`;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await rename(temporaryPath, output);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/build-dataset.ts")) {
  buildDatasetFromFile(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
