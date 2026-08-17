# Pairwise routing runner

`pairwise-runner.ts` запускает оба логических provider-а на одном ограниченном request в offline-режиме.

Результат содержит только `status`, `latencyMs`, token usage и `artifactRef`; prompt и provider output не сохраняются.

Пример:

```ts
const results = await runPairwiseBatch(inputs, { luna, sol }, {
  concurrency: 2,
  timeoutMs: 60_000,
  dryRun: false,
});
```

Ошибки одного provider-а не отменяют второй результат. `dryRun` не вызывает provider-ы, а `maxInputBytes` защищает от неограниченного batch input.

## Dataset preparation

`dataset.ts` строит versioned manifest, удаляет дубликаты по HMAC `requestId` и детерминированно делит записи на `train`, `validation` и `test`. Записи одной сессии не смешиваются между split-ами.

Перед обучением можно включить проверку минимального размера split-а и баланса Luna/Sol:

```ts
const dataset = buildDataset(records, {
  source: "pairwise-run-2026-08-17",
  policyVersion: "policy-1",
  minSplitSize: 10,
  requireBalanced: true,
});
await writeDatasetAtomic("dataset.json", dataset);
```

Export выполняется через временный файл и `rename`, поэтому незавершённая запись не заменяет готовый dataset.
