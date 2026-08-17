import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, parseConfig } from "./config.js";

const validConfig = {
  providers: {
    luna: {
      baseUrl: "https://luna.example.test/v1",
      model: "luna-code",
      apiKeyEnv: "LUNA_API_KEY",
    },
    sol: {
      baseUrl: "https://sol.example.test/v1",
      model: "sol-reasoning",
      apiKeyEnv: "SOL_API_KEY",
    },
  },
};

const tempDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createConfigSandbox() {
  const root = await mkdtemp(join(tmpdir(), "switchlm-config-"));
  const project = join(root, "project");
  const home = join(root, "home");
  const localPath = join(project, "switchlm.config.json");
  const globalPath = join(home, ".switchlm", "config.json");

  tempDirectories.push(root);
  await mkdir(join(home, ".switchlm"), { recursive: true });
  await mkdir(project);
  vi.spyOn(process, "cwd").mockReturnValue(project);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);

  return { root, localPath, globalPath };
}

function configWithPort(port: number) {
  return JSON.stringify({ ...validConfig, port });
}

describe("parseConfig", () => {
  it("uses a 16 MiB request body limit by default", () => {
    expect(parseConfig(validConfig).bodyLimit).toBe(16 * 1024 * 1024);
  });

  it("accepts a custom request body limit", () => {
    expect(parseConfig({ ...validConfig, bodyLimit: 32 * 1024 * 1024 }).bodyLimit).toBe(32 * 1024 * 1024);
  });

  it("applies defaults and reads provider api keys from env", () => {
    const config = parseConfig(validConfig, {
      LUNA_API_KEY: "luna-secret",
      SOL_API_KEY: "sol-secret",
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.routing.solThreshold).toBe(5);
    expect(config.routing.learnedModelPath).toBeUndefined();
    expect(config.routing.trainingData.enabled).toBe(false);
    expect(config.routing.trainingData.maxRecordBytes).toBe(64 * 1024);
    expect(config.routing.trainingData.minIntervalMs).toBe(1_000);
    expect(config.providers.luna.type).toBe("openai-compatible");
    expect(config.providers.sol.type).toBe("openai-compatible");
    expect(config.providers.luna.type === "openai-compatible" && config.providers.luna.apiKey).toBe("luna-secret");
    expect(config.providers.sol.type === "openai-compatible" && config.providers.sol.apiKey).toBe("sol-secret");
  });

  it("accepts ChatGPT Codex provider config", () => {
    const config = parseConfig({
      providers: {
        luna: validConfig.providers.luna,
        sol: {
          type: "codex-chatgpt",
          responsesUrl: "https://chatgpt.example.test/backend-api/codex/responses",
          model: "gpt-5.6-sol",
        },
      },
    });

    expect(config.providers.sol).toEqual({
      type: "codex-chatgpt",
      responsesUrl: "https://chatgpt.example.test/backend-api/codex/responses",
      model: "gpt-5.6-sol",
      account: "default",
    });
  });

  it("rejects invalid provider URLs", () => {
    expect(() =>
      parseConfig({
        providers: {
          ...validConfig.providers,
          luna: { ...validConfig.providers.luna, baseUrl: "not-a-url" },
        },
      }),
    ).toThrow();
  });
});

describe("loadConfig", () => {
  it("prefers the local config over the global config", async () => {
    const { localPath, globalPath } = await createConfigSandbox();
    await writeFile(localPath, configWithPort(1111));
    await writeFile(globalPath, configWithPort(2222));

    expect((await loadConfig()).port).toBe(1111);
  });

  it("uses the global config when the local config is absent", async () => {
    const { globalPath } = await createConfigSandbox();
    await writeFile(globalPath, configWithPort(2222));

    expect((await loadConfig()).port).toBe(2222);
  });

  it("uses an explicit path without fallback", async () => {
    const { root, localPath, globalPath } = await createConfigSandbox();
    const explicitPath = join(root, "explicit.json");
    await writeFile(localPath, configWithPort(1111));
    await writeFile(globalPath, configWithPort(2222));
    await writeFile(explicitPath, configWithPort(3333));

    expect((await loadConfig(explicitPath)).port).toBe(3333);
    await expect(loadConfig(join(root, "missing.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not mask local read errors with the global config", async () => {
    const { localPath, globalPath } = await createConfigSandbox();
    await mkdir(localPath);
    await writeFile(globalPath, configWithPort(2222));

    await expect(loadConfig()).rejects.toBeInstanceOf(Error);
  });

  it("does not mask invalid local JSON with the global config", async () => {
    const { localPath, globalPath } = await createConfigSandbox();
    await writeFile(localPath, "{");
    await writeFile(globalPath, configWithPort(2222));

    await expect(loadConfig()).rejects.toBeInstanceOf(SyntaxError);
  });

  it("lists both checked paths when no config exists", async () => {
    const { localPath, globalPath } = await createConfigSandbox();
    const error = await loadConfig().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(localPath);
    expect((error as Error).message).toContain(globalPath);
  });
});
