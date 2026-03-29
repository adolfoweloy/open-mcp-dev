# Architecture

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend runtime | Node.js + TypeScript |
| Backend framework | Express 4 |
| Frontend | React 19 + TypeScript + Vite 6 |
| Styling | Tailwind CSS 4 |
| LLM streaming | Vercel AI SDK (`ai` v4) |
| MCP client | `@modelcontextprotocol/sdk` v1 |
| Config parsing | `js-yaml` |
| Build | `tsx` (dev), `tsc` (prod) |

## Configuration

All runtime config lives in a single `config.yaml` at the project root (gitignored). No environment variables beyond what the config file provides.

## API Conventions

- All backend routes under `/api/`
- Streaming chat endpoint returns `text/plain` with header `X-Vercel-AI-Data-Stream: v1` (Vercel AI SDK UIMessageStream format)
- Non-streaming endpoints return JSON
- In dev: Vite dev server (port 5173) proxies `/api/*` to Express (port 3000)
- In prod: Express serves the Vite build as static files; no CORS needed

## Auth Model

- No user auth — single-user local app
- OAuth2 Authorization Code + PKCE for MCP servers that require it
- RFC 7591 dynamic client registration: client registers itself at runtime; no pre-configured client credentials
- Public client only (no `client_secret`); PKCE with S256 is the primary security control
- OAuth tokens and client credentials stored in-memory on the server; lost on restart
- API keys (OpenAI) and OAuth tokens never sent to the frontend
- Per-server auth lock in `MCPClientManager` deduplicates concurrent 401s; all callers queue behind one active flow
- Auto-triggered OAuth flows (401 during tool call) emit an `auth_required` data stream event; frontend shows a banner — no direct `window.open()` without a user gesture
- `state` parameter validated server-side in `/oauth/callback` for CSRF protection; `postMessage` origin validated strictly to `http://localhost:{port}`

## Data Storage

- No database or server-side persistence
- Conversation history stored in `localStorage` (key `mcp-chat:conversations`), max 50 conversations
- `Conversation` type includes `isUserRenamed?: boolean` (defaults to `false` when absent) — controls whether auto-title derivation in `handleMessagesChange` is skipped
- OAuth tokens in-memory `Map` on the server process
- MCP server configs persisted to `config.yaml` via a promise-chained write queue in `ConfigWriter` (serialises concurrent writes)

## MCP Transport

- HTTP servers: try `StreamableHTTPClientTransport` first, fall back to `SSEClientTransport`
- STDIO servers: `StdioClientTransport`
- Tool names namespaced as `{serverId}__{toolName}` to avoid cross-server collisions; hyphens in the tool name are replaced with underscores (e.g. `my-tool` from server `my-server` → `my-server__my_tool`)
- `prefer_sse: true` is a config schema field passed through to storage, but `_doConnect` does not currently consult it — StreamableHTTP is always tried first regardless

## MCP UI Widget Protocol

MCP tools can declare a UI resource by setting `_meta["ui/resourceUri"]` to an `mcp://` URI. When a tool result carries this field, `getToolsForAiSdk` attaches `_uiResourceUri` to the result object. `MessageBubble` detects this (or falls back to `mimeType: "text/html"` / `mcp://` URIs in the result content array) and renders `McpResourceFrame`.

### Iframe rendering

`McpResourceFrame` creates a sandboxed iframe (`allow-scripts allow-forms allow-same-origin`). The `src` is `/api/mcp/resource/{serverId}?uri={encodedUri}`. The server fetches the MCP resource via `client.readResource({ uri })` and returns the raw HTML. The widget HTML is responsible for all UI; it communicates back to the host via JSON-RPC 2.0 `postMessage`.

### Handshake

Communication is **widget-initiated**: the widget sends `ui/initialize` first. The host responds with:

```json
{ "protocolVersion": "2025-11-21", "hostInfo": { ... }, "hostCapabilities": { ... } }
```

Immediately after the handshake response the host pushes two notifications into the widget:
- `ui/notifications/tool-input` — the tool arguments that produced this resource
- `ui/notifications/tool-result` — the raw tool result

### Widget → Host messages

| Method | Params | Host action |
|--------|--------|-------------|
| `ui/initialize` | `{ protocolVersion, clientInfo }` | Returns handshake object; pushes tool-input + tool-result |
| `ui/request-display-mode` | `{ mode: "fullscreen" \| "inline" }` | Toggles fullscreen overlay |
| `ui/message` | `{ content: [{ type: "text", text }] }` | Calls `append({ role: "user", content: text })` on `useChat` — equivalent to the ChatGPT Apps SDK `sendFollowUpMessage`; triggers a new LLM turn |
| `tools/call` | `{ name, arguments }` | POSTs to `/api/mcp/tool/{serverId}`; returns JSON result directly (no LLM involved) |
| `ui/notifications/size-changed` | `{ height }` | Resizes the iframe container |
| `ui/update-model-context` | `{ context }` | Calls `onUpdateContext` |

### Host → Widget messages

| Message | When sent |
|---------|-----------|
| Response to `ui/initialize` | After handshake |
| `ui/notifications/tool-input` | After handshake |
| `ui/notifications/tool-result` | After handshake |
| `requestDisplayMode` | When user clicks "Exit fullscreen" in the host UI |
| Responses to `ui/request-display-mode`, `ui/message`, `tools/call` | In response to widget requests |

> Note: the widget→host direction uses `ui/request-display-mode` (with the `ui/` prefix); the host→widget exit-fullscreen notification uses `requestDisplayMode` (no prefix) to match ChatGPT Apps SDK behavior.

## Dropdown / Overlay Rendering

- Sidebar dropdowns (e.g. conversation meatball menu) must be rendered via `ReactDOM.createPortal` into `document.body` to escape `overflow: hidden` sidebar containment
- Position using `getBoundingClientRect` on the trigger element; `position: fixed` on the portal element
- Close on `mousedown` outside (not `click`) to ensure correct event ordering before sibling `onClick` handlers

## MCP Server Registry

- `MCPClientManager` owns an internal `serverConfigs: Map<string, McpServerConfig>` as the authoritative live state
- `addServer / updateServer / removeServer` methods allow hot-reload without process restart
- `removeServer` must clear all 5 OAuth state Maps (`oauthClients`, `tokenSets`, `authLocks`, `pendingStates`, `oauthServerUrls`) keyed by server id to prevent dangling OAuth state
- `GET /api/config/servers` scrubs sensitive fields (`client_secret`, `access_token`, `refresh_token`) — returns boolean presence flags instead; the existing invariant "tokens never sent to frontend" is preserved

## Settings UI Pattern

- "Settings" text link fixed at bottom-left of sidebar → opens a slide-over drawer (same UX pattern as ChatGPT/Claude Desktop)
- Drawer-level and full-page modals rendered via `ReactDOM.createPortal` into `document.body` (follows existing dropdown portal pattern)

## Server Enable/Disable (per-chat)

- Sidebar checkbox = per-chat enable/disable only; connect/disconnect lives in the settings drawer
- `Conversation.enabledServers?: string[]` persists toggle state per conversation in localStorage; absence means all connected servers enabled
- `ChatRequest.disabledServers: string[]` carries the off-toggled server IDs to the backend
- Backend blocks tool calls from disabled servers server-side (returns error string); tools remain visible to the LLM

## Model Configuration

- `GET /api/models` returns the union of a hardcoded OpenAI model list (when an OpenAI API key is configured) and dynamically fetched Ollama models (`GET {ollamaBaseUrl}/api/tags`)
- Model selection is `{ provider: "openai" | "ollama", id: string }` — stored in `ChatRequest.model` and sent on every request
- `ModelSelector` auto-selects the first available model on mount
- Server-side `createModel(selection, config)` dispatches:
  - `openai` provider: `createOpenAI({ apiKey })` from `@ai-sdk/openai`
  - `ollama` provider: also `createOpenAI` but pointed at `{ollamaBaseUrl}/v1` — the native `@ai-sdk/ollama` package is deliberately avoided because it silently drops tool-call tokens
- System prompt is per-provider: `config.llm.openai.system_prompt` / `config.llm.ollama.system_prompt`

## Multi-step LLM Tool Loop

- `streamText` is called with `maxSteps: 20`; Vercel AI SDK drives the loop automatically — after each step that ends with tool calls it feeds the results back for the next LLM step
- `onStepFinish` callback emits debug events for each LLM request/response boundary
- Disabled servers (from `ChatRequest.disabledServers`) are enforced inside the `execute` wrapper of each tool: the wrapper returns an error string if the server is disabled, but the tool definition remains visible to the LLM so it can reason about unavailability

## Debug Event Pipeline

- Server-side debug events (LLM request/response, MCP tool calls, in-flight OAuth) are emitted via the `emitEvent` callback in `chat.ts` as `{ type: 'debug', event: DebugEvent }` data stream entries; `Chat.tsx` forwards them into `DebugContext` via a `useEffect` on `useChat`'s `data` array
- Out-of-band events (startup connect/disconnect, REST-triggered OAuth) are not captured — they occur outside any active SSE stream
- `DebugContext` uses a split-context pattern: `DebugEmitContext` (stable `emit` + `clear`) and `DebugLogContext` (event array), so components that only emit do not re-render on log changes
- Actor colors are hardcoded Tailwind utility classes per actor enum value (not computed from strings) to satisfy Tailwind CSS 4's static scan requirement
- MCP event granularity is logical (callTool call + result), not wire-level JSON-RPC — the SDK `Client` does not expose transport hooks

## Stream Cancellation

- `useChat.stop()` (Vercel AI SDK) is the client-side cancel primitive; it calls `AbortController.abort()` on the fetch
- `isLoading` is the canonical "streaming in progress" flag; the Stop/Send button toggle is gated on it
- Post-cancel synthetic messages are injected via `setMessages` using a `useRef` mirror of the messages array to avoid stale-closure issues
- Discriminant for user cancel vs error: `error === null` after cancel, `error !== null` after network/server failure
- `streamText` on the server does not receive `abortSignal`; in-flight LLM API calls for the cancelled step may run to completion (acceptable resource leak for a local single-user app)

## Error Handling

- MCP connection failures at startup: warn and continue (non-fatal)
- Streaming tool call failures: surfaced inline in the chat thread
- 401 from MCP tool calls: automatic token refresh attempt, then rethrow
- Hot-reload connection failures: surfaced as per-server error badge in settings drawer; non-fatal
