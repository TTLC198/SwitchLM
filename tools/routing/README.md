# Offline routing trainer

The trainer uses a small deterministic perceptron over binary routing features. It runs outside the production server and exports a versioned JSON model containing a bias, threshold, and feature weights.

Training input is JSONL in the `RoutingTrainingExample` format from `src/router/training-example.ts`. Each line must contain one validated example; keep training records separate from `tools/routing/validation-set.json`.

```bash
npx tsx tools/routing/train.ts training-data.jsonl routing-model.json
npx tsx tools/routing/evaluate.ts
```

The validation command reports accuracy, Sol rate, and misclassified scenarios. Compare that report with the learned-model report before considering any runtime integration. This commit does not add a provider, model loading, or production routing change.