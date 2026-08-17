import { z } from "zod";

export const qualityMethodSchema = z.enum(["tests", "build", "typecheck", "human"]);
export type QualityMethod = z.infer<typeof qualityMethodSchema>;

export const qualityEvidenceSchema = z.object({
  method: qualityMethodSchema,
  status: z.enum(["passed", "failed", "error", "unknown"]),
  score: z.number().finite().min(0).max(1).optional(),
  diagnosticCode: z.string().min(1).optional(),
});
export type QualityEvidence = z.infer<typeof qualityEvidenceSchema>;

export type QualityAssessment = {
  method: QualityMethod;
  adapterVersion: "1";
  technicalStatus: "passed" | "failed" | "unknown";
  score: number | null;
  diagnosticCode?: string;
};

export type QualityAdapter = {
  method: QualityMethod;
  evaluate(evidence: QualityEvidence): QualityAssessment;
};

const automatedMethods = new Set<QualityMethod>(["tests", "build", "typecheck"]);

export function createQualityAdapter(method: QualityMethod): QualityAdapter {
  return {
    method,
    evaluate(evidence) {
      const parsed = qualityEvidenceSchema.parse(evidence);
      if (parsed.method !== method) {
        throw new Error(`Quality evidence method mismatch: expected ${method}, got ${parsed.method}`);
      }

      if (method === "human") {
        return {
          method,
          adapterVersion: "1",
          technicalStatus: parsed.score === undefined ? "unknown" : "passed",
          score: parsed.score ?? null,
          ...(parsed.diagnosticCode ? { diagnosticCode: parsed.diagnosticCode } : {}),
        };
      }

      const technicalStatus = parsed.status === "passed" ? "passed" : parsed.status === "failed" ? "failed" : "unknown";
      return {
        method,
        adapterVersion: "1",
        technicalStatus,
        score: technicalStatus === "passed" ? parsed.score ?? 1 : technicalStatus === "failed" ? parsed.score ?? 0 : null,
        ...(parsed.diagnosticCode ? { diagnosticCode: parsed.diagnosticCode } : {}),
      };
    },
  };
}

export function assessQuality(evidence: QualityEvidence): QualityAssessment {
  if (!automatedMethods.has(evidence.method) && evidence.method !== "human") {
    throw new Error(`Unsupported quality method: ${evidence.method}`);
  }
  return createQualityAdapter(evidence.method).evaluate(evidence);
}
