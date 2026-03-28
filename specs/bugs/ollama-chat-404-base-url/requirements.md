# Fix Requirements

## Acceptance Criteria
- When `base_url` is set to `"http://localhost:11434"` (no `/api` suffix), chat messages
  are routed to `http://localhost:11434/api/chat` and succeed.
- When `base_url` is set to `"http://localhost:11434/api"` (with `/api` suffix), chat
  messages still work (no double `/api/api/chat`).
- When no `base_url` is configured, both model listing and chat use consistent defaults
  and work correctly.
- The `base_url` value is normalised in one place so that `routes/models.ts` and
  `lib/models.ts` derive their URLs from the same canonical form.
- Existing model-listing behaviour is preserved (models still appear in the dropdown).

## Non-Goals
- Changing the config schema or renaming the `base_url` field.
- Adding health-check or connectivity validation for Ollama at startup.
- Fixing the cascading `/api/mcp/servers` 500 polling loop (separate bug if it persists
  after this fix).
