import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

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

describe("parseConfig", () => {
  it("applies defaults and reads provider api keys from env", () => {
    const config = parseConfig(validConfig, {
      LUNA_API_KEY: "luna-secret",
      SOL_API_KEY: "sol-secret",
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.routing.solThreshold).toBe(5);
    expect(config.providers.luna.apiKey).toBe("luna-secret");
    expect(config.providers.sol.apiKey).toBe("sol-secret");
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
