# Requirements — Chat Debug Panel

## Functional Requirements

### Event Capture

- Capture the following event types during a chat request:
  - **LLM request**: model id, system prompt, full messages array — emitted before `streamText` is called
  - **LLM response**: finish reason, token usage (prompt/completion/total), assistant text — emitted in `streamText` `onFinish`
  - **Tool invocation**: tool name (namespaced `serverId__toolName`), arguments — emitted when the LLM selects a tool, before execution
  - **MCP tool result**: tool name, result payload — emitted when `callTool` returns successfully
  - **MCP tool error**: tool name, error message — emitted when `callTool` throws
  - **OAuth flow started**: server id, auth URL — emitted when a 401 triggers an OAuth redirect during a tool call
  - **OAuth token received**: server id — emitted when the token exchange completes
  - **OAuth token refreshed**: server id — emitted when an existing token is refreshed
- Each event carries: `id` (UUID), `timestamp` (Date, millisecond precision), `actor`, `type`, `summary` (one-liner string), optional `payload`
- Payloads capped at 10 240 characters after `JSON.stringify`; payloads exceeding the cap are truncated to 10 240 chars with a `[TRUNCATED]` suffix appended
- Out-of-band events (startup connect/disconnect, REST-triggered OAuth) are not captured

### Event Bus

- A `DebugContext` with two sub-contexts:
  - `DebugEmitContext`: provides a stable `emit(event: DebugEvent) => void` function; components that only emit must not re-render on log changes
  - `DebugLogContext`: provides the current `DebugEvent[]` array and is consumed only by the panel
- Provider placed at `App` level, wrapping `Chat` and the debug panel
- Log cleared (reset to `[]`) via a `useEffect` in `App` whenever `activeConversationId` changes

### Panel Toggle

- A vertical toggle handle is rendered on the right edge of the chat area (right border of the chat column)
- Handle is always visible regardless of panel state
- Clicking the handle opens or closes the panel
- Panel is closed by default on first load
- Panel open/closed state persists while the conversation is active but resets on page reload

### Panel Layout

- When open, the panel is rendered as a flex sibling to the chat area inside `App`'s main content row (left sidebar | chat | debug panel)
- The chat area shrinks to make room (no overlay); the three-column layout fills the viewport
- Panel has a minimum width of 240 px and a maximum width of 80% of the viewport
- User can resize the panel by dragging its left border; resize state is in React state (no persistence)

### Log Display

- Events are rendered in a scrollable list, top-to-bottom, newest at bottom
- The panel auto-scrolls to the bottom when a new event is added, unless the user has manually scrolled up
- Each entry displays: `[HH:MM:SS.mmm]` timestamp, `[ACTOR]` label (colour-coded), summary text
- Actor label colours (Tailwind text classes, hardcoded per actor):
  - `llm` → blue
  - `mcp-client` → purple
  - `mcp-server` → green
  - `oauth` → orange
  - `bridge` → pink
  - `error` → red
- Clicking an entry expands it to show the full payload as formatted JSON (pretty-printed with 2-space indent)
- Expanded entries can be collapsed by clicking again
- Truncated payloads display the raw truncated string with a visible `[TRUNCATED]` marker

### Panel Controls

- **Clear** button: resets the log to `[]`
- **Download** button: downloads the current log as `debug-chat.log` in NDJSON format (one `JSON.stringify(event)` per line), using a `<a download>` trigger via a Blob URL

### Conversation Lifecycle

- Switching to a different conversation clears the log immediately
- Creating a new conversation clears the log immediately
- Deleting the active conversation clears the log immediately

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | `emit` must not trigger re-renders in components that do not consume the log; achieved via split context. Panel renders must complete within one frame (< 16 ms) for up to 500 events. |
| Scalability | No hard cap on events per session; however, beyond 1 000 events the panel may scroll slowly — no mitigation required in v1 |
| Security | No debug events transmitted externally; no payloads persisted to localStorage or disk; API keys and tokens must not appear in debug payloads (server must scrub them before emitting) |
| Reliability | If event emission fails (e.g. serialisation error on payload), the error is silently swallowed and the chat flow continues unaffected |
| Observability | The debug panel is itself the observability surface; no additional logging needed |
| Maintainability | Adding a new actor type requires: adding the enum value, adding the colour mapping, and emitting from the relevant call site — no changes to the panel rendering logic |
