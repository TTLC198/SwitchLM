import { createHash, randomBytes } from "node:crypto";

export type PkcePair = {
  verifier: string;
  challenge: string;
};

export function createPkcePair(): PkcePair {
  const verifier = base64Url(randomBytes(32));
  return {
    verifier,
    challenge: pkceChallenge(verifier),
  };
}

export function pkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
