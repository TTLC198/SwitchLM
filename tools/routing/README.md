# Pairwise routing runner

`pairwise-runner.ts` запускает оба логических provider-а на одном ограниченном request в offline-режиме.

–езультат содержит только `status`, `latencyMs`, token usage и `artifactRef`; prompt и provider output не сохран€ютс€.

ѕример:

```ts
const results = await runPairwiseBatch(inputs, { luna, sol }, {
  concurrency: 2,
  timeoutMs: 60_000,
  dryRun: false,
});
```

ќшибки одного provider-а не отмен€ют второй результат. `dryRun` не вызывает provider-ы, а `maxInputBytes` защищает от неограниченного batch input.
