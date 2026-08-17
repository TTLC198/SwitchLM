import type { QualityAssessment } from "./quality-adapters.js";

export type PreferenceModel = "luna" | "sol";
export type PreferenceLabel = {
  preferredModel: PreferenceModel | null;
  status: "labelled" | "unlabelled";
  scoreDelta: number | null;
  reason: "luna-higher" | "sol-higher" | "tie" | "missing-score" | "ambiguous";
};

export function labelPreference(
  assessments: Record<PreferenceModel, QualityAssessment>,
  minDelta = 0,
): PreferenceLabel {
  if (!Number.isFinite(minDelta) || minDelta < 0 || minDelta > 1) {
    throw new Error("minDelta must be between 0 and 1");
  }

  const lunaScore = assessments.luna.score;
  const solScore = assessments.sol.score;
  if (lunaScore === null || solScore === null) {
    return { preferredModel: null, status: "unlabelled", scoreDelta: null, reason: "missing-score" };
  }

  const scoreDelta = Math.abs(lunaScore - solScore);
  if (scoreDelta <= minDelta) {
    return {
      preferredModel: null,
      status: "unlabelled",
      scoreDelta,
      reason: scoreDelta === 0 ? "tie" : "ambiguous",
    };
  }

  return lunaScore > solScore
    ? { preferredModel: "luna", status: "labelled", scoreDelta, reason: "luna-higher" }
    : { preferredModel: "sol", status: "labelled", scoreDelta, reason: "sol-higher" };
}
