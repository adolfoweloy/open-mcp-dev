# Architecture

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend runtime | Node.js + TypeScript |
| Backend framework | Express 4 |
| Frontend | React 19 + TypeScript + Vite 6 |
| Styling | Tailwind CSS 4 |
| LLM streaming | Vercel AI SDK (`ai` v6) |
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
- OAuth tokens in-memory `Map` on the server process

## MCP Transport

- HTTP servers: try `StreamableHTTPClientTransport` first, fall back to `SSEClientTransport`
- STDIO servers: `StdioClientTransport`
- Tool names namespaced as `{serverId}__{toolName}` to avoid cross-server collisions

## MCP UI (ChatGPT Apps SDK Compatibility)

- MCP resource iframes communicate with the host via JSON-RPC 2.0 `postMessage`
- Host injects a `window.openai` shim; supports `requestDisplayMode`, `ui/message`, `tools/call`, `ui/notifications/tool-result`, `ui/update-model-context`
- MCP apps built for ChatGPT work unmodified

## Error Handling

- MCP connection failures at startup: warn and continue (non-fatal)
- Streaming tool call failures: surfaced inline in the chat thread
- 401 from MCP tool calls: automatic token refresh attempt, then rethrow
