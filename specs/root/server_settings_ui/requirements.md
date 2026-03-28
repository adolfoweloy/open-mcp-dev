# Requirements

## Functional Requirements

### Settings Drawer

- A gear icon button is fixed at the bottom-left of the sidebar
- Clicking the icon opens a slide-over drawer panel anchored to the left side of the viewport
- The drawer lists all configured MCP servers (one row per server)
- Each row shows: server name, type badge (`stdio` | `http`), and a connection status badge (`connecting` | `connected` | `error: <message>`)
- The drawer has an **Add Server** button that opens an add-server form
- Each server row has **Edit** and **Delete** action buttons
- Clicking **Edit** opens the edit form pre-populated with the server's current (scrubbed) config
- Clicking **Delete** shows a confirmation prompt then deletes the server immediately (no undo)

### Add / Edit Form

- Shared form used for both add and edit
- **Common fields (all server types)**:
  - Name (text input, required) — the config key; editable in both add and edit
  - Type (radio/select: `stdio` | `http`, required, immutable after creation)
  - Timeout (number input, optional, milliseconds)
- **stdio-specific fields**:
  - Command (text input, required)
  - Args (text input, space-separated string; parsed to array on save)
  - Env (dynamic KEY=VALUE rows; add/remove row buttons)
- **http-specific fields**:
  - URL (text input, required)
  - Prefer SSE (checkbox)
  - OAuth enabled (checkbox toggle)
  - If OAuth enabled: Client ID (text, required), Client Secret (text, optional), Access Token (text, optional), Refresh Token (text, optional)
- All fields are plain text (no masking); a note reads: "Fields are shown in plain text because this is a local-only app"
- For edit: sensitive fields (`client_secret`, `access_token`, `refresh_token`) display a placeholder "(saved)" when a value is stored; clearing the field sets it to empty; leaving the placeholder unchanged preserves the existing value
- Form validates required fields before submit
- Save triggers immediate hot-reload of the connection

### Persistence

- On add/edit/delete, the backend writes the updated server map back to `config.yaml`
- Writes are serialised through a promise-chained queue to prevent concurrent file corruption
- The in-memory `MCPClientManager.serverConfigs` Map is the authoritative live state; `config.yaml` is persistence only

### Hot-Reload

- **Add**: registers the server in `serverConfigs`, calls `connectToServer` immediately; the server is visible in the drawer with `connecting` status
- **Edit (no rename)**: disconnects the old connection, re-registers with new config, reconnects
- **Edit (rename)**: removes old key from `serverConfigs` (and clears all 5 OAuth state Maps for old id), registers under new key, reconnects; `selectedServers` in the UI is cleaned of stale IDs on the next poll cycle
- **Delete**: disconnects, removes from `serverConfigs`, clears all OAuth state Maps for that id

### MCP Client / iframe Integration

- `MCPClientManager.getToolsForAiSdk(undefined)` already returns tools from all connected servers; no change needed for iframe auto-exposure
- Iframe `tools/call` requests route through `/api/chat` which uses all connected servers by default
- The pre-existing bug where iframe `tools/call` omits `model` is out of scope but should be tracked separately

### Security

- `GET /api/config/servers` **never** returns `client_secret`, `access_token`, or `refresh_token` values
- Sensitive fields are replaced with boolean presence flags: `{ has_client_secret: boolean, has_access_token: boolean, has_refresh_token: boolean }`
- `PUT /api/config/servers/:id` body may omit sensitive fields or send `null` to preserve existing values
- A test in `security.test.ts` asserts that the config route handler contains no code path that forwards sensitive fields to the response

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Form save + hot-reconnect completes in < 3 s for stdio servers; HTTP servers may take longer due to transport negotiation |
| Scalability | Supports up to ~20 configured servers without UI degradation |
| Security | `client_secret`, `access_token`, `refresh_token` never returned by any API endpoint; existing security test extended to cover new route |
| Reliability | Write queue ensures no config corruption from concurrent saves; connection failures during hot-reload are surfaced as `error` status badge, not process crash |
| Observability | Console warnings for hot-reload failures; connection errors visible in drawer status badge |
| Maintainability | Config write logic isolated in a `config-writer.ts` service; MCPClientManager CRUD methods are self-contained and do not require changes to route wiring |
