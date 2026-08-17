import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { assessQuality, type QualityEvidence } from "./quality-adapters.js";
import { labelPreference } from "./preference-label.js";

type EvaluationInput = {
  inputId: string;
  requestId: string;
  collectedAt: string;
  routingFeatures: Record<string, number>;
  evidence: { luna: QualityEvidence; sol: QualityEvidence };
};

export async function evaluatePairwise(inputPath: string, outputPath: string): Promise<number> {
  const lines = (await readFile(inputPath, "utf8")).split(/\r?\n/u).filter(Boolean);
  const output: string[] = [];
  for (const line of lines) {
    const input = JSON.parse(line) as EvaluationInput;
    const assessments = { luna: assessQuality(input.evidence.luna), sol: assessQuality(input.evidence.sol) };
    const label = labelPreference(assessments, 0.05);
    if (!label.preferredModel) continue;
    const results = {
      luna: { score: assessments.luna.score ?? 0, passed: assessments.luna.technicalStatus === "passed" },
      sol: { score: assessments.sol.score ?? 0, passed: assessments.sol.technicalStatus === "passed" },
    };
    output.push(JSON.stringify({
      schemaVersion: 2,
      collectedAt: input.collectedAt,
      requestId: input.requestId,
      features: { charCount: 0, lineCount: 0, wordCount: 0, codeBlockCount: 0, listItemCount: 0, hasErrorSignal: false, hasPathSignal: false, routingFeatures: input.routingFeatures },
      results,
      preferredModel: label.preferredModel,
      evaluation: { method: "human" },
    }));
  }
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, output.length ? `${output.join("\n")}\n` : "", "utf8");
  await rename(temporaryPath, outputPath);
  return output.length;
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/tools/routing/evaluate-pairwise.ts")) {
  evaluatePairwise(process.argv[2], process.argv[3]).then((count) => console.log(`Wrote ${count} labelled records`)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
