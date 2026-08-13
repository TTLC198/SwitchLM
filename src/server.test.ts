import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";
import { buildApp } from "./server.js";

const config = parseConfig({
  logLevel: "fatal",
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
});

describe("buildApp", () => {
  it("serves health", async () => {
    const app = buildApp(config);

    const response = await app.inject({ method: "GET", url: "/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", name: "SwitchLM" });
  });

  it("rejects provider types that are not wired yet", () => {
    expect(() =>
      buildApp(
        parseConfig({
          logLevel: "fatal",
          providers: {
            luna: config.providers.luna,
            sol: {
              type: "codex-chatgpt",
              model: "gpt-5.6-sol",
            },
          },
        }),
      ),
    ).toThrow("Provider type is not implemented yet: codex-chatgpt");
  });
});
