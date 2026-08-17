import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

export const defaultTrainingPolicy = {
  enabled: false,
  observationFilePath: defaultTrainingObservationPath(),
  maxRecordBytes: 64 * 1024,
  minIntervalMs: 1_000,
  retentionDays: 30,
  allowRequestPreview: false,
  hmacKeyEnv: "SWITCHLM_TRAINING_HMAC_KEY",
} as const;

export const trainingPolicySchema = z.object({
  enabled: z.boolean().default(defaultTrainingPolicy.enabled),
  filePath: z.string().min(1).optional(),
  observationFilePath: z.string().min(1).default(defaultTrainingPolicy.observationFilePath),
  maxRecordBytes: z.number().int().positive().max(1024 * 1024).default(defaultTrainingPolicy.maxRecordBytes),
  minIntervalMs: z.number().int().min(0).max(60 * 60 * 1000).default(defaultTrainingPolicy.minIntervalMs),
  retentionDays: z.number().int().min(1).max(3650).default(defaultTrainingPolicy.retentionDays),
  allowRequestPreview: z.boolean().default(defaultTrainingPolicy.allowRequestPreview),
  hmacKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/u).default(defaultTrainingPolicy.hmacKeyEnv),
});

export type TrainingPolicy = z.infer<typeof trainingPolicySchema>;

export function validateTrainingPolicy(
  policy: TrainingPolicy,
  env: NodeJS.ProcessEnv = process.env,
  workspace = process.cwd(),
): TrainingPolicy {
  if (!policy.enabled) {
    return policy;
  }

  for (const configuredPath of [policy.filePath, policy.observationFilePath]) {
    if (!configuredPath) continue;
    const filePath = resolve(configuredPath);
    const workspacePath = resolve(workspace);
    const relativePath = relative(workspacePath, filePath);

    const isInsideWorkspace = relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));

    if (!isAbsolute(configuredPath) || isInsideWorkspace) {
      throw new Error("Training data file must be outside the repository and use an absolute path");
    }
  }

  if (!env[policy.hmacKeyEnv]) {
    throw new Error(`Training data requires ${policy.hmacKeyEnv} when enabled`);
  }

  return policy;
}

export function defaultTrainingDataPath(): string {
  return resolve(homedir(), ".switchlm", "routing-training.jsonl");
}

export function defaultTrainingObservationPath(): string {
  return resolve(homedir(), ".switchlm", "routing-observations.jsonl");
}
