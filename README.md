# SwitchLM

Local OpenAI-compatible routing proxy for Codex. SwitchLM exposes the Responses API and routes coding requests between Luna for simple work and Sol for heavier reasoning.

## Key benefits

- Automatically routes simple tasks to Luna and heavier tasks to Sol using transparent deterministic heuristics.
- Supports explicit model selection through `router/luna` and `router/sol` when automatic routing is not desired.
- Connects to ChatGPT/Codex through OAuth, including local token storage and automatic access-token refresh.
- Preserves OpenAI Responses API compatibility, including server-sent event streaming.
- Exposes routing and token statistics through `GET /stats` and `switchlm stats`.
- Runs locally with a small configuration and no database or additional classifier model.

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
      "type": "codex-chatgpt",
      "responsesUrl": "https://chatgpt.com/backend-api/codex/responses",
      "model": "gpt-5.6-luna",
      "account": "default"
    },
    "sol": {
      "type": "codex-chatgpt",
      "responsesUrl": "https://chatgpt.com/backend-api/codex/responses",
      "model": "gpt-5.6-sol",
      "account": "default"
    }
  },
  "logLevel": "info"
}
```

Authenticate once before starting SwitchLM:

```bash
npx switchlm login chatgpt
```

OAuth tokens are stored in `~/.switchlm/auth.json` and refreshed automatically when possible.

OpenAI-compatible providers with API keys are also supported:

```json
{
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
  }
}
```

Provider entries without `type` are treated as `openai-compatible`. Set their credentials through the configured environment variables.

ChatGPT OAuth defaults:

```text
authorizeUrl: https://auth.openai.com/oauth/authorize
tokenUrl: https://auth.openai.com/oauth/token
clientId: app_EMoamEEZ73f0CkXaXp7hrann
scopes: openid profile email offline_access
redirectUri: http://localhost:1455/auth/callback
```

Override them with env if needed:

```bash
set SWITCHLM_CHATGPT_AUTHORIZE_URL=...
set SWITCHLM_CHATGPT_TOKEN_URL=...
set SWITCHLM_CHATGPT_CLIENT_ID=...
set SWITCHLM_CHATGPT_SCOPES=openid profile
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

ChatGPT auth:

```bash
npx switchlm login chatgpt
npx switchlm auth status
npx switchlm logout chatgpt
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

Streaming:

```bash
curl http://127.0.0.1:8787/v1/responses ^
  -H "content-type: application/json" ^
  -d "{\"model\":\"router/auto\",\"input\":\"Fix this TypeScript error\",\"stream\":true}"
```

Virtual models:

- `router/auto` routes by deterministic heuristics.
- `router/luna` always routes to Luna.
- `router/sol` always routes to Sol.

Streaming requests are passed through as server-sent events.

The `codex-chatgpt` provider authenticates through the SwitchLM OAuth flow and uses the configured Codex Responses transport URL.

## Codex

Add the following provider to the user-level `~/.codex/config.toml`:

```toml
model = "router/auto"
model_provider = "switchlm"

[model_providers.switchlm]
name = "SwitchLM"
base_url = "http://127.0.0.1:8787/v1"
wire_api = "responses"
```

Use `router/luna` or `router/sol` when a request must bypass automatic routing.

## License

SwitchLM is distributed under the MIT License. See `LICENSE`.

Parts of the ChatGPT/Codex OAuth integration are based on or adapted from OmniRoute. See `THIRD_PARTY_NOTICES.md` for attribution and third-party license terms.
