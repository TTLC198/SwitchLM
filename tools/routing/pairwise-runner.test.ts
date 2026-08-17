import { describe, expect, it, vi } from "vitest";
import type { Provider } from "../../src/providers/provider.js";
import { runPairwise, runPairwiseBatch } from "./pairwise-runner.js";

function provider(response: unknown, delayMs = 0): Provider {
  return { createResponse: vi.fn(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return response;
  }) };
}

describe("pairwise runner", () => {
  it("runs both providers and stores only bounded metadata", async () => {
    const result = await runPairwise(
      { id: "example-1", request: { input: "safe request" }, artifactRef: "artifact/1" },
      { luna: provider({ usage: { input_tokens: 2, output_tokens: 3 } }), sol: provider({ usage: { total_tokens: 9 } }) },
      { now: () => 100 },
    );

    expect(result).toEqual({
      inputId: "example-1",
      artifactRef: "artifact/1",
      dryRun: false,
      results: {
        luna: { status: "success", latencyMs: 0, tokenUsage: { input: 2, output: 3, total: undefined } },
        sol: { status: "success", latencyMs: 0, tokenUsage: { input: undefined, output: undefined, total: 9 } },
      },
    });
    expect(JSON.stringify(result)).not.toContain("safe request");
  });

  it("keeps partial success and classifies timeout", async () => {
    const result = await runPairwise(
      { id: "example-2", request: { input: "safe request" } },
      { luna: provider({ ok: true }), sol: provider({ ok: true }, 20) },
      { timeoutMs: 5 },
    );

    expect(result.results.luna.status).toBe("success");
    expect(result.results.sol).toMatchObject({ status: "timeout", errorCode: "timeout" });
  });

  it("supports dry-run, input bounds, and batch concurrency", async () => {
    const luna = provider({ ok: true });
    const sol = provider({ ok: true });
    const providers = { luna, sol };

    expect((await runPairwise({ id: "dry", request: { input: "x" } }, providers, { dryRun: true })).results.luna.status).toBe("skipped");
    expect(luna.createResponse).not.toHaveBeenCalled();
    expect((await runPairwise({ id: "bad", request: { input: "12345" } }, providers, { maxInputBytes: 1 })).results.luna.errorCode).toBe("invalid_input");

    const results = await runPairwiseBatch(
      [{ id: "a", request: {} }, { id: "b", request: {} }, { id: "c", request: {} }],
      providers,
      { dryRun: true, concurrency: 2 },
    );
    expect(results.map((item) => item.inputId)).toEqual(["a", "b", "c"]);
  });
});
