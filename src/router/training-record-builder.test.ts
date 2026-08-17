import { describe, expect, it } from "vitest";
import { buildTrainingRecord } from "./training-record-builder.js";

const example = {
  schemaVersion: 1,
  request: "Bearer secret email user@example.com C:\\Users\\alice\\repo\\file.ts\n- fix error",
  results: { luna: { score: 0.6, passed: false }, sol: { score: 0.9, passed: true } },
  preferredModel: "sol",
  evaluation: { method: "tests" },
} as const;

describe("buildTrainingRecord", () => {
  it("stores an HMAC id and bounded feature summary without preview by default", () => {
    const record = buildTrainingRecord(example, { hmacKey: "test-key", collectedAt: "2026-08-17T00:00:00.000Z" });

    expect(record).toMatchObject({ schemaVersion: 2, collectedAt: "2026-08-17T00:00:00.000Z" });
    expect(record?.requestId).toMatch(/^[a-f0-9]{64}$/u);
    expect(record).not.toHaveProperty("request");
    expect(record).not.toHaveProperty("requestPreview");
    expect(record?.features).toMatchObject({ hasErrorSignal: true, listItemCount: 1 });
  });

  it("redacts sensitive values in an explicitly enabled preview", () => {
    const record = buildTrainingRecord(example, {
      hmacKey: "test-key",
      allowRequestPreview: true,
      maxPreviewChars: 500,
      collectedAt: "2026-08-17T00:00:00.000Z",
    });

    expect(record?.requestPreview).not.toContain("secret");
    expect(record?.requestPreview).not.toContain("user@example.com");
    expect(record?.requestPreview).not.toContain("alice");
  });

  it("rejects empty or invalid records", () => {
    expect(buildTrainingRecord({ ...example, request: " " }, { hmacKey: "key", collectedAt: "2026-08-17" })).toBeNull();
    expect(buildTrainingRecord(example, { hmacKey: "", collectedAt: "2026-08-17" })).toBeNull();
  });
});

