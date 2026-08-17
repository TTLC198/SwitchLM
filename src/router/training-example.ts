import { z } from "zod";

const trainingModelResultSchema = z.object({
  score: z.number().finite(),
  passed: z.boolean(),
});

const trainingEvaluationSchema = z.object({
  method: z.enum(["tests", "build", "typecheck", "human"]),
});

export const routingTrainingExampleSchema = z.object({
  schemaVersion: z.literal(1),
  request: z.string().min(1),
  results: z.object({
    luna: trainingModelResultSchema,
    sol: trainingModelResultSchema,
  }),
  preferredModel: z.enum(["luna", "sol"]),
  evaluation: trainingEvaluationSchema,
});

export type RoutingTrainingExample = z.infer<typeof routingTrainingExampleSchema>;
export type TrainingEvaluationMethod = RoutingTrainingExample["evaluation"]["method"];

export function parseRoutingTrainingExample(input: unknown): RoutingTrainingExample {
  return routingTrainingExampleSchema.parse(input);
}

export function serializeRoutingTrainingExample(example: RoutingTrainingExample): string {
  return JSON.stringify(routingTrainingExampleSchema.parse(example));
}

export function deserializeRoutingTrainingExample(serialized: string): RoutingTrainingExample {
  return parseRoutingTrainingExample(JSON.parse(serialized));
}