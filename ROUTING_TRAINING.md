# Обучение маршрутизатора

Документ описывает текущий безопасный pipeline обучения SwitchLM. Runtime-сбор, разметка, offline-обучение и rollout разделены, поэтому обычный запрос не запускает обучение и не меняет production-маршрутизацию.

## Поток данных

```text
POST /v1/responses
  -> runtime observation
  -> локальный JSONL вне репозитория
  -> ручная/автоматическая оценка
  -> normalized training record
  -> queue: pending -> evaluated/rejected -> included
  -> dataset split
  -> offline model artifact
  -> quality gate
  -> shadow rollout
```

Runtime observations не являются labels. Они фиксируют только признаки запроса, выбранную модель, score, причины выбора, latency и успешность ответа.

## Безопасное включение

Сбор выключен по умолчанию. Для локального эксперимента добавьте в конфигурацию:

```json
{
  "routing": {
    "trainingData": {
      "enabled": true,
      "capturePrompts": true,
      "observationFilePath": "C:/Users/me/.switchlm/routing-observations.jsonl",
      "requestFilePath": "C:/Users/me/.switchlm/routing-requests.jsonl",
      "filePath": "C:/Users/me/.switchlm/routing-training.jsonl",
      "hmacKeyEnv": "SWITCHLM_TRAINING_HMAC_KEY"
    }
  }
}
```

`capturePrompts` дополнительно включает запись полных JSON-запросов в `requestFilePath`.
Она работает только вместе с `enabled: true`, по умолчанию выключена и ограничена `maxRequestBytes`.
Файл содержит чувствительные данные и должен оставаться вне репозитория.

Перед запуском задайте HMAC-ключ в environment:

```powershell
$env:SWITCHLM_TRAINING_HMAC_KEY = "local-secret-key"
```

Пути должны быть абсолютными и находиться вне репозитория. HMAC-ключ не записывается в dataset.

## Ежедневная работа

После настройки конфигурации и запуска из собранного CLI:

```powershell
switchlm training init
switchlm training status
switchlm training report
```

Во время работы `router/auto` асинхронно пишет наблюдения только для автоматической маршрутизации. Запись не задерживает ответ провайдера. В наблюдениях нет полного prompt, токенов, cookies или provider output.

Для разработки те же команды можно запускать так:

```powershell
npx tsx src/cli.ts training init
npx tsx src/cli.ts training status
npx tsx src/cli.ts training report
```

`training status` и `training report` показывают количество runtime observations и распределение записей очереди по состояниям.

## Очередь и worker

Очередь хранится по умолчанию в:

```text
~/.switchlm/routing-training-queue.json
```

Поддерживаются состояния:

```text
pending -> evaluated -> included
pending -> rejected
evaluated -> rejected
```

`TrainingWorker` является библиотечным API. Он требует явный evaluator callback и поэтому не запускает скрытую оценку или обучение:

```ts
const worker = new TrainingWorker({
  queue,
  minPendingRecords: 10,
  maxRetries: 2,
  retentionDays: 30,
});

await worker.run(async (entry) => {
  const assessment = await evaluateRecord(entry.record);
  return assessment.passed
    ? { status: "evaluated", reason: "quality checks passed" }
    : { status: "rejected", reason: "quality checks failed" };
});
```

Worker использует lock-файл, пропускает запуск при недостаточном количестве pending-записей, повторяет временные ошибки evaluator и удаляет старые `rejected`/`included` записи после retention period. `pending` и `evaluated` записи автоматически не удаляются.

## Offline pipeline

Для получения labels из pairwise quality evidence:

```powershell
npx tsx tools/routing/evaluate-pairwise.ts evidence.jsonl normalized-records.jsonl
```

Для построения versioned dataset:

```powershell
npx tsx tools/routing/build-dataset.ts `
  --input normalized-records.jsonl `
  --output dataset.json `
  --source pairwise-run-2026-08-17 `
  --policy-version policy-1
```

Перед обучением проверьте размер и баланс split-ов. Обучение compact linear model выполняется offline:

```powershell
npx tsx tools/routing/train-artifact.ts `
  --dataset dataset.json `
  --output routing-model.json `
  --model-version routing-2026-08-17-001
```

Проверка quality gate:

```powershell
npx tsx tools/routing/quality-gate-cli.ts comparison-report.json gate-report.json
```

Модель не следует включать в production только потому, что artifact успешно создан. Сначала сравните её с baseline на отложенном наборе, затем используйте shadow mode.

## Ограничения

- Runtime observations пока не превращаются автоматически в labels.
- Worker не имеет отдельной CLI-команды и запускается через библиотечный API.
- Pairwise CLI подключает только `openai-compatible` providers.
- Автоматические quality evaluation, model promotion и rollback требуют следующих этапов.
- JSONL, dataset и model artifacts не должны коммититься в репозиторий.

## Full prompt capture

To automatically collect requests, enable both flags:

```json
{
  "routing": {
    "trainingData": {
      "enabled": true,
      "capturePrompts": true,
      "requestFilePath": "C:/Users/me/.switchlm/routing-requests.jsonl",
      "maxRequestBytes": 262144
    }
  }
}
```

Full JSON requests are written only for `router/auto` to `requestFilePath` and are compatible with `tools/routing/collect-pairwise.ts`. `capturePrompts` is disabled by default; the file may contain sensitive data and must stay outside the repository.
