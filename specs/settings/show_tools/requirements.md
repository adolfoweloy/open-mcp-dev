# Requirements: settings/show_tools

## Functional Requirements

### View Tools Button

- A "Tools" text button is added to the `ServerRow` component in `SettingsDrawer.tsx`.
- The button is only rendered when `status.connected === true`.
- The button follows the existing small text-button style used by other row actions (Edit, Delete).
- Clicking the button opens the Server Capabilities Modal for that server.

### Backend Endpoint

- New route: `GET /api/mcp/:serverId/capabilities` added to `mcp-proxy.ts`.
- Returns `{ tools: Tool[], resources: Resource[], resourcesSupported: boolean }`.
- `tools` is the result of `client.listTools()` — all tool objects as returned by the MCP SDK.
- `resources` is the result of `client.listResources()` — all resource objects as returned by the MCP SDK.
- `resourcesSupported` is `true` if the server advertised the `resources` capability, `false` otherwise.
- `listResources()` is only called if `client.getServerCapabilities()?.resources` is truthy; otherwise `resources: []` and `resourcesSupported: false` are returned without calling the SDK method.
- Both `listTools()` and `listResources()` are wrapped in `Promise.race` with a 5-second timeout; if either times out the endpoint returns HTTP 504.
- If `listTools()` throws, the endpoint returns HTTP 503 (not an empty list).
- If the server ID does not exist or has no live client, the endpoint returns HTTP 404.
- The new `fetchServerCapabilities(serverId)` function is added to `client/src/lib/api.ts` following the existing `checkResponse` pattern.
- Response type `ServerCapabilitiesResponse` is added to `shared/types.ts`.

### Server Capabilities Modal

- The modal is rendered via `ReactDOM.createPortal` to `document.body`.
- Overlay: full-screen darkened backdrop at `zIndex: 2000`, matching `ServerFormModal`.
- Inner panel: centered, scrollable, with a header, search input, content area, and close button.
- Header shows the server ID and a close button (✕ with `aria-label="Close"`).
- The modal has `role="dialog"` and `aria-modal="true"` on the inner panel element.
- Clicking the overlay backdrop closes the modal.
- The Settings drawer's outside-click handler is suppressed while the modal is open (pass an `isToolsModalOpen` flag to the drawer's mousedown guard, or stop mousedown propagation on the modal overlay).

### Loading and Error States

- While the fetch is in progress, a loading indicator is shown inside the modal content area.
- If the endpoint returns an error, an error message is shown inside the modal (not a toast).
- The modal remains open on error; the user can close it manually.

### Search / Filter

- A text input at the top of the modal content area filters both tools and resources by name (case-insensitive substring match).
- Filtering is client-side; no additional network requests.
- The filter input is cleared when the modal is closed and re-opened.
- If no tools/resources match the filter, a "No results" message is shown for that section.

### Tools Section

- A "Tools" section header is always shown (even when the tool list is empty).
- If the server has no tools, an "No tools available" empty-state message is shown.
- Each tool is displayed as a collapsed accordion item showing the tool name.
- Clicking a tool item expands it to show:
  - **Description** — plain text, shown only if `tool.description` is present.
  - **Input Schema** — `JSON.stringify(tool.inputSchema, null, 2)` inside a `<pre>` block, always shown.
  - **Output Schema** — `JSON.stringify(tool.outputSchema, null, 2)` inside a `<pre>` block, shown only if `tool.outputSchema` is present.
  - **Annotations** — `JSON.stringify(tool.annotations, null, 2)` inside a `<pre>` block, shown only if `tool.annotations` is present.
- Only one tool can be expanded at a time (clicking an already-open item collapses it; clicking a different item collapses the previous one).

### Resources Section

- A "Resources" section header is shown only if `resourcesSupported === true`.
- If `resourcesSupported === false`, the Resources section is omitted entirely (not shown as empty).
- If `resourcesSupported === true` and `resources` is empty, a "No resources available" empty-state message is shown.
- Each resource is displayed as a collapsed accordion item showing the resource name (or URI if name is absent).
- Clicking a resource item expands it to show all resource fields formatted as `JSON.stringify(resource, null, 2)` inside a `<pre>` block.
- Accordion behavior matches the Tools section (one item open at a time, per section independently).

### Code Block Formatting

- All `<pre>` blocks use a monospace font and a subtle background (matching the debug panel payload style).
- No syntax highlighting library is added.
- Schemas are truncated at 10 240 characters (matching the existing `serializePayload` truncation limit) to guard against pathologically large schemas; a truncation notice is shown if truncated.

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Endpoint must respond within 5 seconds; timeout after that with HTTP 504. Loading spinner shown immediately on modal open while fetch is in-flight. |
| Scalability | No concern — single-user local app. |
| Security | No new auth surface. Endpoint is local-only (same single-user model). Server ID is validated against the live client map; unknown IDs return 404. |
| Reliability | `listResources()` capability-gated to avoid SDK throw. Both list calls wrapped in timeout. `listTools()` failure returns 503, not empty list. |
| Observability | No new logging required beyond existing Express error handling. |
| Maintainability | New modal is a standalone component (`ServerCapabilitiesModal`); not embedded in `SettingsDrawer`. Shared type in `shared/types.ts`. |
