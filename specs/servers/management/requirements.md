# Requirements: Servers Management

## Functional Requirements

### Sidebar — Toggle (per-chat enable/disable)

- Each server row shows a checkbox (enabled/disabled) and the server name.
- Checkbox is **disabled and greyed out** when the server is not connected.
- Checking/unchecking updates `enabledServers` on the active `Conversation` and persists to localStorage immediately.
- New conversations default `enabledServers` to all currently connected servers.
- Connect/reconnect/disconnect buttons are **removed** from the sidebar entirely.
- If `McpServerStatus.error` is set, display the raw error string inline beneath the server name (small, muted text); the row remains non-interactive.
- The `⚙` gear icon at the bottom of the sidebar is replaced with a plain "Settings" text link; clicking it opens the settings drawer.

### Settings Drawer — Connection Controls

- Each server row in the settings drawer shows: server id, connection status badge (connected / disconnected / error), and action buttons.
- When disconnected (no error / non-OAuth): show **Reconnect** button.
- When disconnected and requires OAuth: show **Connect** button (triggers OAuth flow).
- When connected: show **Disconnect** button.
- When in error state: show **Reconnect** button plus the raw error string.
- Connect/Disconnect/Reconnect actions call existing API endpoints (`POST /api/servers/:id/connect`, `POST /api/servers/:id/disconnect`).
- After any connection action, the server list is refreshed.
- Existing edit and delete actions remain unchanged.

### Tool Call Blocking

- All connected servers' tools are always included in the LLM's tool list, regardless of toggle state.
- When the LLM calls a tool belonging to a server that is in `disabledServers` (not in `enabledServers`), the backend returns a tool-call error response: `"Server '{id}' is disabled for this conversation."` — it does **not** execute the tool.
- `ChatRequest` is extended with `disabledServers: string[]` (server IDs currently toggled off).
- Backend chat handler checks `disabledServers` before dispatching any tool call.

### Per-Chat State Persistence

- `Conversation` type gains `enabledServers?: string[]`.
- Absence of the field is treated as "all connected servers enabled" (backwards compat with existing saved conversations).
- State is saved to localStorage on every toggle change.
- Switching conversations restores that conversation's `enabledServers`.

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Toggle state changes are synchronous localStorage writes; no network round-trips. |
| Scalability | No new polling or network load; sidebar already polls every 5 s. |
| Security | No change to auth model; `disabledServers` is advisory only (tool call blocking is server-side). |
| Reliability | If `enabledServers` is missing from a loaded conversation, default to all connected servers enabled; no crash. |
| Observability | No new logging required beyond existing error patterns. |
| Maintainability | Changes confined to: `ServerSidebar.tsx`, `SettingsDrawer.tsx`, `App.tsx` (gear→link), `types.ts` (Conversation + ChatRequest), backend chat handler. |
