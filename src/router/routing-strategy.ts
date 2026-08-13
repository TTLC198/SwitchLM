export type RoutingTarget = "luna" | "sol";

export type RoutingRequest = {
  model?: string;
  input: unknown;
};

export type RoutingDecision = {
  target: RoutingTarget;
  score: number;
  reasons: string[];
};

export interface RoutingStrategy {
  route(request: RoutingRequest): RoutingDecision;
}
