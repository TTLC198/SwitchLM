import { readFile, writeFile, rename } from "node:fs/promises";
import { evaluateQualityGate } from "./quality-gate.js";
import type { RoutingComparison } from "./compare-routing.js";

export async function runQualityGate(inputPath: string, outputPath?: string): Promise<void> {
  const report = JSON.parse(await readFile(inputPath, "utf8")) as RoutingComparison;
  const result = evaluateQualityGate(report);
  if (outputPath) {
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, `${JSON.stringify({ report: report.modelMetadata, gate: result }, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
  }
  if (!result.passed) throw new Error(`Quality gate failed: ${result.violations.join("; ")}`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/quality-gate-cli.ts")) {
  runQualityGate(process.argv[2], process.argv[3]).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
