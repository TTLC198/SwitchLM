# SwitchLM

[![npm version](https://img.shields.io/npm/v/switchlm.svg)](https://www.npmjs.com/package/switchlm)
[![license](https://img.shields.io/npm/l/switchlm.svg)](LICENSE)

Local OpenAI-compatible routing proxy for Codex. SwitchLM exposes the Responses API and routes coding requests between Luna for simple work and Sol for heavier reasoning.

SwitchLM is published on npm as `switchlm`. The current release is `1.0.2`.

## Key benefits

- Automatically routes simple tasks to Luna and heavier tasks to Sol using transparent deterministic heuristics.
- Supports explicit model selection through `router/luna` and `router/sol` when automatic routing is not desired.
- Connects to ChatGPT/Codex through OAuth, including local token storage and automatic access-token refresh.
- Preserves OpenAI Responses API compatibility, including server-sent event streaming.
- Exposes routing and token statistics through `GET /stats` and `switchlm stats`.
- Runs locally with a small configuration and no database or additional classifier model.

## Install

Install the published package globally:

```bash
npm install --global switchlm
```

Upgrade to the latest published version:

```bash
npm update --global switchlm
```

To run from source instead:

```bash
npm install
npm run build
```

## Configure

Create the global user config at `~/.switchlm/config.json` (`%USERPROFILE%\.switchlm\config.json` on Windows) so SwitchLM commands work from any directory. A project-level `./switchlm.config.json` overrides the global config when both exist.

To move an existing project config on PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.switchlm"
Move-Item .\switchlm.config.json "$HOME\.switchlm\config.json"
```

Configuration example:

```json
{
  "host": "127.0.0.1",
  "port": 8787,
  "bodyLimit": 16777216,
  "routing": {
    "solThreshold": 5,
    "trainingData": {
      "enabled": false,
      "maxRecordBytes": 65536,
      "minIntervalMs": 1000,
      "retentionDays": 30,
      "allowRequestPreview": false,
      "hmacKeyEnv": "SWITCHLM_TRAINING_HMAC_KEY"
    }
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

`bodyLimit` is the maximum request body size in bytes. The default is 16 MiB; increase it if Codex sends a larger repository context.

Authenticate once before starting SwitchLM:

```bash
switchlm login chatgpt
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
switchlm start
```

Or from TypeScript during development:

```bash
npm run dev
```

Check health:

```bash
switchlm status
```

Show token usage:

```bash
npx switchlm stats
```

ChatGPT auth:

```bash
switchlm login chatgpt
switchlm auth status
switchlm logout chatgpt
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

- `router/auto` routes by deterministic heuristics over the latest user message; earlier user messages, developer/system context, and tool items are ignored.
- `router/luna` always routes to Luna.
- `router/sol` always routes to Sol.

Because each request is evaluated independently, `router/auto` can switch from Luna to Sol or from Sol to Luna within the same session.

## Automatic routing

`router/auto` assigns a score to the latest user message and selects Sol when the score is at least `routing.solThreshold` (default: `5`); otherwise it selects Luna. The decision keeps the score and matching `reasons`, which are also included in routing logs.

Heavy signal groups are counted once each:

- `risk` (`5`): race conditions, deadlocks, concurrency, and security audit/analysis.
- `architecture` (`4`): architecture, redesign, and large refactoring.
- `scope` (`3`): multiple modules, cross-module, repository-wide, or entire-repository work.
- `diagnostics` (`2`): debugging requests.

Structural signals add smaller increments: multiple file paths (`+2`), multiple modules (`+2`), code blocks (`+1`), stack traces (`+2`), logs (`+1`), and two or more list requirements (`+2`). Combination bonuses add `+2` for architecture with multiple modules, diagnostics with a stack trace, and security analysis with a code change.

Obvious local tasks reduce the score when no hard risk signal is present: typo fixes (`-2`), a single rename (`-2`), formatting (`-2`), and a code change in one file (`-1`). These reductions never cancel explicit risk, concurrency, or security-analysis signals.

Examples with the default threshold:

| Request | Score | Model |
| --- | ---: | --- |
| `Rename this variable.` | `-2` | Luna |
| `Review the architecture of one module.` | `4` | Luna |
| `Investigate this race condition.` | `5` | Sol |
| `Debugging this failure` with a stack trace | `7` | Sol |

Known limitations: the router is deterministic and keyword-based, structural detection is approximate, and it does not understand task semantics. It analyzes only the latest user message and currently uses a fixed threshold rather than learned weights.
Streaming requests are passed through as server-sent events.

The `codex-chatgpt` provider authenticates through the SwitchLM OAuth flow and uses the configured Codex Responses transport URL.

Token statistics:

```bash
curl http://127.0.0.1:8787/stats
```

The response contains routing and token totals for Luna, Sol, and both providers combined.
When shadow routing is enabled by an embedding application, `/stats` also exposes `shadow` metrics: comparison count, disagreements, shadow errors, Sol rates for primary and shadow decisions, and accumulated shadow latency. Shadow decisions never select a provider and no prompt content is stored. `routedRequests` counts model selections, while `measuredResponses` counts completed responses with valid provider `usage`. The CLI shows their difference as `missing`. Statistics reset when SwitchLM restarts.

With `logLevel: "info"`, each routing log includes the requested virtual model, selected target, score, and matching reasons without logging prompt contents.

The `codex-chatgpt` provider uses the configured Codex Responses transport URL.
Training data collection is disabled by default.
Training collection remains disabled unless `routing.trainingData.enabled` is explicitly set to `true`. Enabled collection requires the HMAC key in the configured environment variable and an absolute file path outside the repository. The policy does not permit prompt content in normal logs or telemetry. When explicitly enabled for an offline experiment, the collector writes bounded JSONL records to a local file, rate-limits writes, truncates the request preview, and masks common token and API-key patterns. It does not write to normal routing logs. SwitchLM does not bundle provider-specific OAuth client credentials; set them explicitly through env.


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
