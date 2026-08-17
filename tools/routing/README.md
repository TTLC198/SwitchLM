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

## End-to-end training commands

Подготовка normalized records из quality evidence:

```powershell
npx tsx tools/routing/evaluate-pairwise.ts evidence.jsonl normalized-records.jsonl
```

Сбор pairwise результатов из request JSONL:

```powershell
npx tsx tools/routing/collect-pairwise.ts --input requests.jsonl --output pairwise-results.jsonl --concurrency 2
```

Для проверки CLI без вызова provider используйте `--dry-run`.

Построение versioned dataset:

```powershell
npx tsx tools/routing/build-dataset.ts `
  --input normalized-records.jsonl `
  --output dataset.json `
  --source pairwise-run-2026-08-17 `
  --policy-version policy-1
```

Обучение versioned model artifact:

```powershell
npx tsx tools/routing/train-artifact.ts `
  --dataset dataset.json `
  --output routing-model.json `
  --model-version routing-2026-08-17-001
```

Quality gate принимает агрегированный report от `compareRouting` и завершает процесс с ненулевым кодом при нарушении порогов:

```powershell
npx tsx tools/routing/quality-gate-cli.ts comparison-report.json gate-report.json
```

Не коммитьте реальные JSONL/dataset/model artifacts или credentials.
