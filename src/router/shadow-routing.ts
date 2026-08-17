import type { RoutingDecision, RoutingRequest, RoutingStrategy } from "../router/routing-strategy.js";

export type ShadowComparison = {
  primary: RoutingDecision;
  shadow?: RoutingDecision;
  latencyMs: number;
};

export type ShadowRoutingOptions = {
  sampleRate?: number;
  random?: () => number;
};

export class ShadowRoutingStrategy implements RoutingStrategy {
  private readonly sampleRate: number;
  private readonly random: () => number;

  constructor(
    private readonly primary: RoutingStrategy,
    private readonly shadow: RoutingStrategy,
    private readonly observe: (comparison: ShadowComparison) => void,
    options: ShadowRoutingOptions = {},
  ) {
    this.sampleRate = options.sampleRate ?? 1;
    this.random = options.random ?? Math.random;
    if (!Number.isFinite(this.sampleRate) || this.sampleRate < 0 || this.sampleRate > 1) {
      throw new Error("Shadow sample rate must be between 0 and 1");
    }
  }

  route(request: RoutingRequest): RoutingDecision {
    const primary = this.primary.route(request);
    if (request.model === "router/luna" || request.model === "router/sol" || this.random() >= this.sampleRate) {
      return primary;
    }

    const startedAt = performance.now();
    try {
      const shadow = this.shadow.route(request);
      this.observe({ primary, shadow, latencyMs: performance.now() - startedAt });
    } catch {
      this.observe({ primary, latencyMs: performance.now() - startedAt });
    }

    return primary;
  }
}
