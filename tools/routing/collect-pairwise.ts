import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadConfig } from "../../src/config.js";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible-provider.js";
import type { Provider } from "../../src/providers/provider.js";
import { runPairwiseBatch, type PairwiseInput } from "./pairwise-runner.js";

function value(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function readInputs(path: string): Promise<PairwiseInput[]> {
  return (await readFile(path, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as PairwiseInput);
}

function createProvider(config: Awaited<ReturnType<typeof loadConfig>>["providers"]["luna"]): Provider {
  if (config.type !== "openai-compatible") throw new Error("collect-pairwise CLI currently requires openai-compatible providers");
  return new OpenAICompatibleProvider(config);
}

async function writeAtomic(path: string, lines: string[]): Promise<void> {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  await rename(temporaryPath, path);
}

export async function collectPairwise(args: string[]): Promise<void> {
  const inputPath = value(args, "--input");
  const outputPath = value(args, "--output");
  if (!inputPath || !outputPath) throw new Error("Usage: collect-pairwise --input requests.jsonl --output results.jsonl");
  const config = await loadConfig(value(args, "--config"));
  const results = await runPairwiseBatch(await readInputs(inputPath), { luna: createProvider(config.providers.luna), sol: createProvider(config.providers.sol) }, {
    concurrency: Number(value(args, "--concurrency", "1")),
    timeoutMs: Number(value(args, "--timeout-ms", "60000")),
    dryRun: flag(args, "--dry-run"),
  });
  await writeAtomic(outputPath, results.map((result) => JSON.stringify(result)));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/collect-pairwise.ts")) {
  collectPairwise(process.argv.slice(2)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
