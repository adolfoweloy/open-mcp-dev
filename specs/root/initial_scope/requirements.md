# Requirements

## Functional Requirements

### Chat

- Client sends `POST /api/chat` with `messages` (Vercel AI SDK `UIMessage[]`), `model` (`{ provider, id }`), and `selectedServers` (string[])
- Server uses `streamText()` with tools from selected MCP servers; response streamed via `pipeUIMessageStreamToResponse()`
- Multi-step agentic loop: up to 20 steps (`stopWhen: stepCountIs(20)`)
- Tool calls collapsed by default in the UI, expandable on click (name, arguments, raw result)
- Streaming errors shown inline in the message thread; stream stops gracefully
- Conversation history persisted to `localStorage` and restored on page refresh

### Model Selection

- `GET /api/models` returns available models:
  - If `config.llm.openai` present → hardcoded list of common OpenAI models
  - If `config.llm.ollama` present → dynamically fetched from `GET {base_url}/api/tags`
- Frontend shows a `<select>` dropdown; default is the first model in the list
- Model selection is ephemeral (React state); resets to first model on refresh

### MCP Server Management

- All servers declared in `config.yaml`; no dynamic registration
- Non-OAuth servers auto-connected at startup; failures logged as warnings, server skipped
- OAuth servers connected lazily after OAuth flow completes
- `GET /api/mcp/servers` returns each server's `{ id, connected, requiresOAuth }`
- `POST /api/mcp/connect` body `{ serverId }` reconnects a disconnected server by ID
- `DELETE /api/mcp/disconnect` body `{ serverId }` disconnects a connected server
- Frontend sidebar shows all servers with connection status; OAuth servers show a "Connect" button that opens `/api/oauth/start?server=<id>` in the browser

### MCP Resource UI Rendering

- When a tool result contains `type: "resource"` with `mimeType: "text/html"`, or `type: "text"` with a `data:text/html` payload, or a `mcp://` URI — render an iframe
- Iframe `src` points to `/api/mcp/resource/:serverId?uri=<encoded-uri>` (backend proxy)
- Proxy fetches the HTML resource from the MCP server using the stored access token (if any) and streams it back; only HTML content is proxied
- Fullscreen mode: clicking a fullscreen button on the iframe container expands to a true fullscreen overlay (entire viewport)

### ChatGPT Apps SDK Bridge (`window.openai`)

- The host page injects a `window.openai` shim into every MCP resource iframe via `postMessage`
- Implements the following methods (JSON-RPC 2.0 over `postMessage`):
  - `requestDisplayMode({ mode })` — `mode: "fullscreen"` triggers the fullscreen overlay; `mode: "inline"` or `mode: "picture-in-picture"` collapse it
  - `ui/message` — iframe sends a follow-up user message into the active chat thread
  - `tools/call` — iframe invokes an MCP tool directly; result sent back as `ui/notifications/tool-result`
  - `ui/update-model-context` — iframe updates the LLM context visible to the model
- MCP apps built for ChatGPT using these APIs must work unmodified in this client

### OAuth2 for MCP Servers

- Flow: Authorization Code + PKCE via `@modelcontextprotocol/sdk/client/auth.js`
- `GET /api/oauth/start?server=<id>` discovers OAuth metadata, performs Dynamic Client Registration (or uses pre-configured `client_id`/`client_secret`), generates PKCE, redirects to auth URL
- `GET /api/oauth/callback?code=&state=` validates state, exchanges code for tokens, stores tokens in memory, connects the MCP server, redirects to `/`
- Tokens stored in-memory only; lost on server restart (user must re-authorize)
- 401 responses from MCP tool calls trigger automatic token refresh attempt before rethrowing

### System Prompts

- `config.yaml` supports per-provider system prompts:
  - `llm.openai.system_prompt`
  - `llm.ollama.system_prompt`
- System prompt passed as the first message to `streamText()` if present

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Streaming response must begin rendering within 2 s of request; tool call round-trips should not noticeably block UI |
| Scalability | Single-user local app; no concurrency requirements |
| Security | API keys and OAuth tokens never sent to the frontend; MCP resource proxy keeps auth server-side; iframe sandboxed with `allow-scripts allow-forms allow-same-origin` |
| Reliability | MCP server connection failures at startup are non-fatal (warn and continue); tool call failures are shown inline |
| Observability | Server logs MCP connection events and tool call errors to stdout; no external telemetry |
| Maintainability | TypeScript throughout; `tsx` for dev, `tsc` for prod build |
