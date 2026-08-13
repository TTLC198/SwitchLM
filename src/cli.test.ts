import { describe, expect, it } from "vitest";
import { parseCommand } from "./cli.js";

describe("parseCommand", () => {
  it("accepts MVP command names", () => {
    expect(parseCommand(["start"])).toBe("start");
    expect(parseCommand(["status"])).toBe("status");
  });

  it("rejects unknown commands", () => {
    expect(parseCommand(["install"])).toBeUndefined();
  });
});
