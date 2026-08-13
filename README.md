# SwitchLM

Local OpenAI-compatible routing proxy for Codex. SwitchLM exposes the Responses API and routes coding requests between Luna for simple work and Sol for heavier reasoning.

## Install

```bash
npm install
npm run build
```

## Configure

Create `switchlm.config.json` in the project root:

```json
{
  "host": "127.0.0.1",
  "port": 8787,
  "routing": {
    "solThreshold": 5
  },
  "providers": {
    "luna": {
      "baseUrl": "https://luna.example.com/v1",
      "model": "luna-code",
      "apiKeyEnv": "LUNA_API_KEY"
    },
    "sol": {
      "baseUrl": "https://sol.example.com/v1",
      "model": "sol-reasoning",
      "apiKeyEnv": "SOL_API_KEY"
    }
  },
  "logLevel": "info"
}
```

Set provider credentials through environment variables:

```bash
set LUNA_API_KEY=...
set SOL_API_KEY=...
```

## Run

```bash
npm start
```

Or from TypeScript during development:

```bash
npm run dev
```

Check health:

```bash
npx switchlm status
```

## API

Health:

```bash
curl http://127.0.0.1:8787/health
```

Responses:

```bash
curl http://127.0.0.1:8787/v1/responses ^
  -H "content-type: application/json" ^
  -d "{\"model\":\"router/auto\",\"input\":\"Fix this TypeScript error\"}"
```

Virtual models:

- `router/auto` routes by deterministic heuristics.
- `router/luna` always routes to Luna.
- `router/sol` always routes to Sol.

Streaming requests currently return `501`.

## Codex

Point Codex or any OpenAI-compatible client at:

```text
base_url: http://127.0.0.1:8787/v1
model: router/auto
```

Use `router/luna` or `router/sol` when a request must bypass automatic routing.
