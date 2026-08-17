import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

const openAICompatibleProviderConfigSchema = z.object({
  type: z.literal("openai-compatible").default("openai-compatible"),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKeyEnv: z.string().min(1),
});

const codexChatGptProviderConfigSchema = z.object({
  type: z.literal("codex-chatgpt"),
  responsesUrl: z.string().url(),
  model: z.string().min(1),
  account: z.string().min(1).default("default"),
});

const providerConfigSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !("type" in value)) {
    return { type: "openai-compatible", ...value };
  }

  return value;
}, z.discriminatedUnion("type", [openAICompatibleProviderConfigSchema, codexChatGptProviderConfigSchema]));

const rawConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(8787),
  bodyLimit: z.number().int().positive().default(16 * 1024 * 1024),
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
    luna: ProviderConfig;
    sol: ProviderConfig;
  };
};

export type OpenAICompatibleProviderConfig = z.infer<typeof openAICompatibleProviderConfigSchema> & {
  apiKey?: string;
};
export type CodexChatGptProviderConfig = z.infer<typeof codexChatGptProviderConfigSchema>;
export type ProviderConfig = OpenAICompatibleProviderConfig | CodexChatGptProviderConfig;

export function parseConfig(input: unknown, env: NodeJS.ProcessEnv = process.env): AppConfig {
  const config = rawConfigSchema.parse(input);

  return {
    ...config,
    providers: {
      luna: withProviderSecret(config.providers.luna, env),
      sol: withProviderSecret(config.providers.sol, env),
    },
  };
}

function withProviderSecret(
  provider: z.infer<typeof providerConfigSchema>,
  env: NodeJS.ProcessEnv,
): ProviderConfig {
  if (provider.type !== "openai-compatible") {
    return provider;
  }

  return { ...provider, apiKey: env[provider.apiKeyEnv] };
}

export function resolveConfigPaths(path?: string): string[] {
  return path === undefined
    ? [resolve("switchlm.config.json"), join(homedir(), ".switchlm", "config.json")]
    : [path];
}

export async function loadConfig(path?: string, env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  const paths = resolveConfigPaths(path);

  for (const configPath of paths) {
    try {
      const text = await readFile(configPath, "utf8");
      return parseConfig(JSON.parse(text), env);
    } catch (error) {
      if (path !== undefined || !(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }

  throw new Error(`SwitchLM config not found. Checked:\n- ${paths.join("\n- ")}`);
}
