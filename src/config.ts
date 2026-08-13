import { readFile } from "node:fs/promises";
import { z } from "zod";

const providerConfigSchema = z.object({
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1),
});

const rawConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(8787),
  routing: z
    .object({
      solThreshold: z.number().min(0).default(5),
    })
    .default({ solThreshold: 5 }),
  providers: z.object({
    luna: providerConfigSchema,
    sol: providerConfigSchema,
  }),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type AppConfig = z.infer<typeof rawConfigSchema> & {
  providers: {
    luna: z.infer<typeof providerConfigSchema> & { apiKey?: string };
    sol: z.infer<typeof providerConfigSchema> & { apiKey?: string };
  };
};

export function parseConfig(input: unknown, env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = rawConfigSchema.parse(input);

  return {
    ...config,
    providers: {
      luna: { ...config.providers.luna, apiKey: env[config.providers.luna.apiKeyEnv] },
      sol: { ...config.providers.sol, apiKey: env[config.providers.sol.apiKeyEnv] },
    },
  };
}

export async function loadConfig(
  path = "switchlm.config.json",
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> {
  const text = await readFile(path, "utf8");
  return parseConfig(JSON.parse(text), env);
}
