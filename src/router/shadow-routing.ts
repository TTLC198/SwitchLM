import type { RoutingDecision, RoutingRequest, RoutingStrategy } from "./routing-strategy.js";

export type ShadowComparison = {
  primary: RoutingDecision;
  shadow?: RoutingDecision;
  latencyMs: number;
};

export class ShadowRoutingStrategy implements RoutingStrategy {
  constructor(
    private readonly primary: RoutingStrategy,
    private readonly shadow: RoutingStrategy,
    private readonly observe: (comparison: ShadowComparison) => void,
  ) {}

  route(request: RoutingRequest): RoutingDecision {
    const startedAt = performance.now();
    const primary = this.primary.route(request);

    try {
      const shadow = this.shadow.route(request);
      this.observe({ primary, shadow, latencyMs: performance.now() - startedAt });
    } catch {
      this.observe({ primary, latencyMs: performance.now() - startedAt });
    }

    return primary;
  }
}