import { z } from "zod";

export const routingModelSchema = z.object({
  schemaVersion: z.literal(1),
  threshold: z.number().finite(),
  bias: z.number().finite(),
  weights: z.record(z.string(), z.number().finite()),
});

export type RoutingModel = z.infer<typeof routingModelSchema>;

export function parseRoutingModel(input: unknown): RoutingModel {
  return routingModelSchema.parse(input);
}

export function serializeRoutingModel(model: RoutingModel): string {
  return JSON.stringify(routingModelSchema.parse(model), null, 2);
}