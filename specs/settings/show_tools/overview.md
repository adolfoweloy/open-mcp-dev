# settings/show_tools — Server Capabilities Inspector

## Purpose

Adds a "Tools" button to each connected server row in the Settings drawer. Clicking it opens a modal that lists all tools and resources provided by that server, with per-item expand/collapse and a search filter. Gives the user visibility into what each MCP server actually exposes without needing to start a chat.

## Key Design Decisions

- **One combined backend endpoint** (`GET /api/mcp/:serverId/capabilities`) returns both tools and resources in a single round-trip; added to `mcp-proxy.ts` alongside the existing tool/resource proxy routes.
- **Fetch on open, no cache** — tools/resources may change while the app is running; a local process fetch is fast enough (< 200ms) that a loading spinner is acceptable and a cache layer is not worth the complexity.
- **`listResources()` must be gated** on `client.getServerCapabilities().resources` before calling it, because the MCP SDK throws synchronously (not rejects) if the `resources` capability is absent. The response includes a `resourcesSupported` boolean so the frontend can distinguish "empty" from "not supported".
- **Both calls get a 5-second timeout** via `Promise.race` to prevent hanging Express requests from unresponsive servers.
- **Portal + z-index** — modal rendered via `ReactDOM.createPortal` to `document.body` at `zIndex: 2000`, matching `ServerFormModal`. The Settings drawer's outside-click handler must be suppressed while the modal is open to prevent the drawer from closing underneath the modal.
- **Schema formatting** — `JSON.stringify(value, null, 2)` in a `<pre>` block, consistent with the existing `serializePayload` pattern in the debug panel. No syntax highlighting library.
- **Button only shown when connected** — the "Tools" button is absent from the row when `status.connected === false`.

## Non-Goals

- Syntax highlighting of JSON schemas.
- Caching or polling for live tool-list updates.
- Editing or invoking tools from the inspector modal.
- Showing MCP server prompts (only tools and resources).
- Pagination of tool/resource lists.

## References

- Requirements: [requirements.md](requirements.md)
- Backend pattern: `server/routes/mcp-proxy.ts` — existing `tool/:serverId` and `resource/:serverId` routes
- Modal pattern: `client/src/components/ServerFormModal.tsx`
- Schema formatting pattern: `serializePayload` in `server/lib/mcp-manager.ts`
