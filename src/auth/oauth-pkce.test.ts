import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPkcePair, pkceChallenge } from "./oauth-pkce.js";

describe("oauth PKCE", () => {
  it("creates a verifier and SHA256 base64url challenge", () => {
    const pair = createPkcePair();

    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toBe(pkceChallenge(pair.verifier));
  });

  it("matches the RFC7636 example", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");

    expect(pkceChallenge(verifier)).toBe(expected);
  });
});
