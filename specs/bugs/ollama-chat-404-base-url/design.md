# Design: ollama-chat-404-base-url

## Root Cause

The `base_url` config value is interpreted differently by two code paths:

1. **Model listing** (`server/lib/ollama.ts:listOllamaModels`): treats `base_url` as the
   raw Ollama host (e.g. `http://localhost:11434`) and appends `/api/tags` itself.
2. **Chat** (`server/lib/models.ts:createModel`): passes `base_url` directly to
   `createOllama({ baseURL })`. The `ollama-ai-provider` SDK expects `baseURL` to end in
   `/api` because it appends `/chat` to form `/api/chat`.

When a user sets `base_url: "http://localhost:11434"` (the natural value), model listing
works (`/api/tags` is appended), but chat hits `http://localhost:11434/chat` (404).

The default in `createModel` (`http://localhost:11434/api`) masks the bug for users who
don't set `base_url`, but `routes/models.ts` uses a different default
(`http://localhost:11434`) — the defaults are inconsistent too.

## Proposed Fix

Create a single normalisation function `normaliseOllamaBaseUrl(raw: string): string` in
`server/lib/ollama.ts` that:

1. Strips trailing slashes
2. Ensures the URL ends with `/api`
3. Returns the normalised URL

Both consumers then call this function:

- `server/lib/models.ts:createModel` — pass normalised URL to `createOllama({ baseURL })`
- `server/lib/ollama.ts:listOllamaModels` — use normalised URL + `/tags` (instead of
  raw URL + `/api/tags`)

The single default `http://localhost:11434` is used everywhere (normalisation adds `/api`).

### Changes

| File | Change |
|------|--------|
| `server/lib/ollama.ts` | Add `normaliseOllamaBaseUrl()`. Update `listOllamaModels` to use it. |
| `server/lib/models.ts` | Import and use `normaliseOllamaBaseUrl()`. Change default to `http://localhost:11434`. |
| `server/routes/models.ts` | No change needed — already passes raw URL to `listOllamaModels`. |

## Test Strategy

Unit-test `normaliseOllamaBaseUrl` with inputs:
- `http://localhost:11434` → `http://localhost:11434/api`
- `http://localhost:11434/` → `http://localhost:11434/api`
- `http://localhost:11434/api` → `http://localhost:11434/api`
- `http://localhost:11434/api/` → `http://localhost:11434/api`
- `http://custom:8080` → `http://custom:8080/api`
