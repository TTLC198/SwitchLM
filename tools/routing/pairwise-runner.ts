import type { Provider, ProviderRequest } from "../../src/providers/provider.js";

export type PairwiseModel = "luna" | "sol";
export type PairwiseInput = {
  id: string;
  request: ProviderRequest;
  artifactRef?: string;
};

export type PairwiseProviderResult = {
  status: "success" | "error" | "timeout" | "skipped";
  latencyMs?: number;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  errorCode?: "provider_error" | "timeout" | "invalid_input";
};

export type PairwiseResult = {
  inputId: string;
  artifactRef: string;
  dryRun: boolean;
  results: Record<PairwiseModel, PairwiseProviderResult>;
};

export type PairwiseRunnerOptions = {
  timeoutMs?: number;
  maxInputBytes?: number;
  concurrency?: number;
  dryRun?: boolean;
  now?: () => number;
};

const defaultTimeoutMs = 60_000;
const defaultMaxInputBytes = 256 * 1024;

export async function runPairwise(
  input: PairwiseInput,
  providers: Record<PairwiseModel, Provider>,
  options: PairwiseRunnerOptions = {},
): Promise<PairwiseResult> {
  const settings = normalizeOptions(options);
  const artifactRef = input.artifactRef ?? `pairwise/${input.id}`;
  const base: PairwiseResult = {
    inputId: input.id,
    artifactRef,
    dryRun: settings.dryRun,
    results: {
      luna: { status: "skipped" },
      sol: { status: "skipped" },
    },
  };

  if (!input.id || !isBoundedRequest(input.request, settings.maxInputBytes)) {
    return {
      ...base,
      results: { luna: { status: "error", errorCode: "invalid_input" }, sol: { status: "error", errorCode: "invalid_input" } },
    };
  }

  if (settings.dryRun) {
    return base;
  }

  const entries = await Promise.all([
    runProvider("luna", input.request, providers.luna, settings),
    runProvider("sol", input.request, providers.sol, settings),
  ]);

  return { ...base, results: Object.fromEntries(entries) as Record<PairwiseModel, PairwiseProviderResult> };
}

export async function runPairwiseBatch(
  inputs: PairwiseInput[],
  providers: Record<PairwiseModel, Provider>,
  options: PairwiseRunnerOptions = {},
): Promise<PairwiseResult[]> {
  const settings = normalizeOptions(options);
  const results: PairwiseResult[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      results[index] = await runPairwise(inputs[index], providers, settings);
    }
  }

  await Promise.all(Array.from({ length: Math.min(settings.concurrency, Math.max(inputs.length, 1)) }, () => worker()));
  return results;
}

async function runProvider(
  model: PairwiseModel,
  request: ProviderRequest,
  provider: Provider,
  options: Required<Pick<PairwiseRunnerOptions, "timeoutMs" | "now">>,
): Promise<[PairwiseModel, PairwiseProviderResult]> {
  const startedAt = options.now();
  try {
    const response = await withTimeout(provider.createResponse(request), options.timeoutMs);
    return [model, {
      status: "success",
      latencyMs: Math.max(0, options.now() - startedAt),
      tokenUsage: extractTokenUsage(response),
    }];
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "PAIRWISE_TIMEOUT";
    return [model, {
      status: timedOut ? "timeout" : "error",
      latencyMs: Math.max(0, options.now() - startedAt),
      errorCode: timedOut ? "timeout" : "provider_error",
    }];
  }
}

function normalizeOptions(options: PairwiseRunnerOptions): Required<PairwiseRunnerOptions> {
  return {
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
    maxInputBytes: options.maxInputBytes ?? defaultMaxInputBytes,
    concurrency: Math.max(1, Math.floor(options.concurrency ?? 1)),
    dryRun: options.dryRun ?? false,
    now: options.now ?? Date.now,
  };
}

function isBoundedRequest(request: ProviderRequest, maxInputBytes: number): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(request), "utf8") <= maxInputBytes;
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PAIRWISE_TIMEOUT")), timeoutMs)),
  ]);
}

function extractTokenUsage(response: unknown): PairwiseProviderResult["tokenUsage"] {
  if (!response || typeof response !== "object" || !("usage" in response)) return undefined;
  const usage = response.usage;
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  const input = numberValue(value.input_tokens ?? value.prompt_tokens);
  const output = numberValue(value.output_tokens ?? value.completion_tokens);
  const total = numberValue(value.total_tokens);
  return input === undefined && output === undefined && total === undefined ? undefined : { input, output, total };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
