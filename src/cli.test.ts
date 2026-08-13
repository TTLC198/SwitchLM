import { describe, expect, it } from "vitest";
import { chatGptOAuthConfigFromEnv, healthUrl, parseCommand } from "./cli.js";

describe("parseCommand", () => {
  it("accepts MVP command names", () => {
    expect(parseCommand(["start"])).toBe("start");
    expect(parseCommand(["status"])).toBe("status");
    expect(parseCommand(["login", "chatgpt"])).toBe("login chatgpt");
    expect(parseCommand(["logout", "chatgpt"])).toBe("logout chatgpt");
    expect(parseCommand(["auth", "status"])).toBe("auth status");
  });

  it("rejects unknown commands", () => {
    expect(parseCommand(["install"])).toBeUndefined();
  });

  it("builds the health URL from config", () => {
    expect(healthUrl({ host: "127.0.0.1", port: 8787 })).toBe("http://127.0.0.1:8787/health");
    expect(healthUrl({ host: "0.0.0.0", port: 8787 })).toBe("http://127.0.0.1:8787/health");
  });

  it("reads ChatGPT OAuth config from env", () => {
    expect(
      chatGptOAuthConfigFromEnv({
        SWITCHLM_CHATGPT_AUTHORIZE_URL: "https://example.test/auth",
        SWITCHLM_CHATGPT_TOKEN_URL: "https://example.test/token",
        SWITCHLM_CHATGPT_CLIENT_ID: "client",
        SWITCHLM_CHATGPT_SCOPES: "openid profile",
      }),
    ).toEqual({
      authorizeUrl: "https://example.test/auth",
      tokenUrl: "https://example.test/token",
      clientId: "client",
      scopes: ["openid", "profile"],
      extraParams: {
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "codex_cli_rs",
        prompt: "login",
      },
    });
  });
});
