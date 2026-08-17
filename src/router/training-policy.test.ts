import { describe, expect, it } from "vitest";
import { defaultTrainingPolicy, trainingPolicySchema, validateTrainingPolicy } from "./training-policy.js";

describe("training policy", () => {
  it("keeps collection disabled by default", () => {
    const policy = trainingPolicySchema.parse({});

    expect(policy).toEqual(defaultTrainingPolicy);
    expect(validateTrainingPolicy(policy, {}, "C:/workspace")).toEqual(policy);
  });

  it("requires an HMAC key when collection is enabled", () => {
    const policy = trainingPolicySchema.parse({ enabled: true });

    expect(() => validateTrainingPolicy(policy, {}, "C:/workspace")).toThrow("SWITCHLM_TRAINING_HMAC_KEY");
  });

  it("rejects relative and workspace paths", () => {
    const relative = trainingPolicySchema.parse({ enabled: true, filePath: "training.jsonl" });
    const inside = trainingPolicySchema.parse({ enabled: true, filePath: "C:/workspace/training.jsonl" });
    const env = { SWITCHLM_TRAINING_HMAC_KEY: "local-test-key" };

    expect(() => validateTrainingPolicy(relative, env, "C:/workspace")).toThrow("outside the repository");
    expect(() => validateTrainingPolicy(inside, env, "C:/workspace")).toThrow("outside the repository");
  });

  it("accepts an absolute path outside the workspace", () => {
    const policy = trainingPolicySchema.parse({
      enabled: true,
      filePath: "C:/Users/test/.switchlm/training.jsonl",
      retentionDays: 90,
    });

    expect(validateTrainingPolicy(policy, { SWITCHLM_TRAINING_HMAC_KEY: "local-test-key" }, "C:/workspace")).toEqual(policy);
  });
});