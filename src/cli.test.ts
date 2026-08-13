import { describe, expect, it } from "vitest";
import { healthUrl, parseCommand } from "./cli.js";

describe("parseCommand", () => {
  it("accepts MVP command names", () => {
    expect(parseCommand(["start"])).toBe("start");
    expect(parseCommand(["status"])).toBe("status");
  });

  it("rejects unknown commands", () => {
    expect(parseCommand(["install"])).toBeUndefined();
  });

  it("builds the health URL from config", () => {
    expect(healthUrl({ host: "127.0.0.1", port: 8787 })).toBe("http://127.0.0.1:8787/health");
    expect(healthUrl({ host: "0.0.0.0", port: 8787 })).toBe("http://127.0.0.1:8787/health");
  });
});
