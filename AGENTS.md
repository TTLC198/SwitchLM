# SwitchLM development instructions

## Goal

SwitchLM is a lightweight local model-routing proxy intended primarily
for Codex clients.

It exposes an OpenAI-compatible Responses API and routes requests between
a fast/cheap model and a powerful model.

## Technology

- Node.js 22+
- TypeScript
- Fastify
- Zod
- Vitest
- npm

Avoid unnecessary frameworks and infrastructure.

## Architecture

Keep these concerns separated:

- HTTP/OpenAI compatibility
- routing decision
- model providers
- configuration
- telemetry

Providers and routing strategies must be replaceable through interfaces.

Do not couple routing logic directly to Fastify routes.

## MVP models

Logical model names:

- fast -> Luna
- heavy -> Sol

Expose virtual models:

- router/auto
- router/luna
- router/sol

`router/auto` uses the configured routing strategy.

## Routing

Initial implementation must use deterministic heuristics.

Do not introduce embeddings, databases, vector stores or an additional
classifier model in MVP.

The routing engine should return both:

- selected model
- reason/score used to select it

This allows future observability and tuning.

## Heavy task indicators

Examples:

- architecture
- redesign
- large refactoring
- concurrency
- race conditions
- deadlocks
- difficult debugging
- security analysis
- cross-module changes
- repository-wide analysis

Avoid routing to Sol based only on prompt length.

Use several signals where possible.

## API

MVP:

- POST /v1/responses
- GET /health

Maintain OpenAI Responses API compatibility as closely as practical.

Streaming must be designed for, even if implemented after the first
non-streaming vertical slice.

## Configuration

Configuration must not contain secrets committed to git.

Prefer environment variables for credentials.

Application configuration may define:

- listen host
- listen port
- provider endpoints
- model names
- routing threshold
- routing weights
- logging level

## Development rules

Prefer small modules and explicit interfaces.

Do not over-engineer the MVP.

Add tests for routing decisions.

Before large architectural changes, explain why they are needed.

After every implementation step:

1. run tests;
2. run type checking;
3. summarize changed files;
4. mention remaining work.

## MVP completion criteria

The MVP is complete when:

1. SwitchLM starts locally.
2. GET /health succeeds.
3. Codex can call POST /v1/responses through it.
4. router/luna always routes to Luna.
5. router/sol always routes to Sol.
6. router/auto chooses Luna or Sol based on heuristics.
7. routing decisions are logged.
8. routing logic has automated tests.
9. README contains installation and Codex configuration instructions.