# Design

## Data Model

### Config (`config.yaml`)

```typescript
interface Config {
  llm: {
    openai?: { api_key: string; default_model?: string; system_prompt?: string };
    ollama?: { base_url?: string; system_prompt?: string };
  };
  mcp_servers: Record<string, McpServerConfig>;
}

type McpServerConfig =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string>; timeout?: number }
  | { type: "http"; url: string; oauth?: boolean; client_id?: string; client_secret?: string;
      access_token?: string; refresh_token?: string; prefer_sse?: boolean; timeout?: number };
```

### Model Selection

```typescript
interface ModelInfo { provider: "openai" | "ollama"; id: string; label: string; }
interface ModelSelection { provider: "openai" | "ollama"; id: string; }
```

### Frontend Persistence (localStorage)

- Key `mcp-chat:conversations` — array of `{ id, title, messages: UIMessage[] }`, max 50 conversations
- Key `mcp-chat:active-conversation` — ID of the currently open conversation
- Conversations pruned by recency when limit exceeded

---

## Interfaces

### Backend API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Streaming chat; body `{ messages, model, selectedServers }` |
| `GET` | `/api/models` | List available models |
| `GET` | `/api/mcp/servers` | List server statuses |
| `POST` | `/api/mcp/connect` | Reconnect server; body `{ serverId }` |
| `DELETE` | `/api/mcp/disconnect` | Disconnect server; body `{ serverId }` |
| `GET` | `/api/mcp/resource/:serverId` | Proxy HTML resource; query `?uri=<encoded>` |
| `GET` | `/api/oauth/start` | Begin OAuth flow; query `?server=<id>` |
| `GET` | `/api/oauth/callback` | OAuth callback; query `?code=&state=` |

### Chat Request/Response

```typescript
// POST /api/chat
interface ChatRequest {
  messages: UIMessage[];           // Vercel AI SDK format
  model: ModelSelection;
  selectedServers: string[];
}
// Response: text/plain SSE stream (Vercel AI SDK UIMessageStream)
// Header: X-Vercel-AI-Data-Stream: v1
```

### ChatGPT Apps SDK Bridge (postMessage)

The host page sends this bootstrap message to the iframe on load:
```json
{ "jsonrpc": "2.0", "method": "ui/ready", "params": { "version": "1.0" } }
```

Messages from iframe to host:
```json
{ "jsonrpc": "2.0", "id": 1, "method": "requestDisplayMode", "params": { "mode": "fullscreen" } }
{ "jsonrpc": "2.0", "method": "ui/message", "params": { "role": "user", "content": [{ "type": "text", "text": "..." }] } }
{ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": "toolName", "arguments": {} } }
{ "jsonrpc": "2.0", "method": "ui/update-model-context", "params": { "content": [{ "type": "text", "text": "..." }] } }
```

Messages from host to iframe:
```json
{ "jsonrpc": "2.0", "id": 1, "result": { "mode": "fullscreen" } }
{ "jsonrpc": "2.0", "method": "ui/notifications/tool-result", "params": { "content": [], "structuredContent": {} } }
```

---

## Component Design

### Directory Structure

```
mcp-chat/
├── config.yaml                    # User config (gitignored)
├── config.example.yaml
├── package.json
├── tsconfig.json
├── server/
│   ├── index.ts                   # Express app, startup, auto-connect
│   ├── config.ts                  # Load & validate config.yaml
│   ├── routes/
│   │   ├── chat.ts                # POST /api/chat
│   │   ├── models.ts              # GET /api/models
│   │   ├── mcp.ts                 # server list, connect, disconnect
│   │   ├── mcp-proxy.ts           # HTML resource proxy
│   │   └── oauth.ts               # OAuth start + callback
│   └── lib/
│       ├── mcp-manager.ts         # MCPClientManager
│       ├── models.ts              # createModel() factory
│       └── ollama.ts              # listOllamaModels()
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Chat.tsx            # useChat() hook, sends POST /api/chat
│       │   ├── MessageList.tsx
│       │   ├── MessageBubble.tsx
│       │   ├── ToolCallResult.tsx  # Collapsible tool call + result
│       │   ├── McpResourceFrame.tsx # iframe + fullscreen overlay + window.openai bridge
│       │   ├── ModelSelector.tsx
│       │   └── ServerSidebar.tsx   # Server status + Connect buttons
│       └── lib/
│           ├── api.ts
│           ├── storage.ts          # localStorage helpers
│           └── types.ts
└── shared/
    └── types.ts
```

### Key Components

**`MCPClientManager`** (server-side singleton)
- Manages connection state per server; deduplicates in-flight connects
- `getToolsForAiSdk(serverIds?)` → Vercel AI SDK `ToolSet` with namespaced keys `{serverId}__{toolName}`
- JSON Schema normalization: ensures top-level `type: "object"` for Anthropic compatibility
- HTTP transport: tries `StreamableHTTPClientTransport` first, falls back to `SSEClientTransport`

**`McpResourceFrame`** (frontend component)
- Renders iframe for HTML MCP resources
- Injects `window.openai` shim via `postMessage` after iframe loads
- Handles `requestDisplayMode({ mode: "fullscreen" })` → mounts a full-viewport overlay div
- Forwards `ui/message` content into the active chat via the `useChat()` hook
- Forwards `tools/call` to `POST /api/chat` as a single-message thread, returns result as `ui/notifications/tool-result`

**Chat route** (`server/routes/chat.ts`)
```typescript
router.post("/chat", async (req, res) => {
  const { messages, model, selectedServers } = req.body;
  const systemPrompt = getSystemPrompt(model, config);
  const llm = createModel(model, config);
  const tools = await mcpManager.getToolsForAiSdk(selectedServers);
  const result = streamText({
    model: llm,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    onError: (err) => console.error("[chat]", err),
  });
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Vercel-AI-Data-Stream", "v1");
  result.pipeUIMessageStreamToResponse(res);
});
```

**OAuth flow** (`server/routes/oauth.ts`)
- `pendingSessions: Map<state, { serverId, codeVerifier, clientInfo }>` — in-memory, cleared after callback
- `oauthTokens: Map<serverId, OAuthTokens>` — in-memory, lost on restart
- Uses `discoverOAuthProtectedResourceMetadata`, `discoverOAuthMetadata`, `registerClient`, `startAuthorization`, `exchangeAuthorization` from `@modelcontextprotocol/sdk/client/auth.js`

### Startup Sequence

1. Load and validate `config.yaml`
2. Instantiate `MCPClientManager`
3. For each server in `config.mcp_servers`:
   - If `type: "http"` and `oauth: true` → skip (lazy connect after OAuth)
   - Otherwise → `mcpManager.connectToServer(id, config)` with `.catch(warn and continue)`
4. Mount Express routes
5. In dev: Vite dev server proxies `/api/*` to Express; in prod: Express serves built client

---

## Key Decisions

### Vercel AI SDK for streaming
**Decision**: Use `streamText()` + `pipeUIMessageStreamToResponse()` + `useChat()`.
**Why**: Handles multi-step agentic loops, tool execution, and SSE streaming with minimal glue code. Battle-tested alternative to hand-rolling.

### window.openai bridge via postMessage
**Decision**: Inject bridge from host page into iframe via `postMessage`; do not modify iframe content.
**Why**: MCP resource iframes are served by third-party servers. The host cannot inject scripts directly. The ChatGPT Apps SDK pattern uses `postMessage` for exactly this reason — cross-origin safe.
**Alternative considered**: Proxy all iframe content through our server and inject a `<script>` tag. Rejected: too complex, breaks relative URLs, requires full HTML parsing.

### Tool name namespacing
**Decision**: `{serverId}__{toolName}` as the Vercel AI SDK tool key.
**Why**: Multiple servers may expose tools with the same name. Namespacing prevents collisions and makes execution routing unambiguous.

### In-memory OAuth tokens
**Decision**: Tokens stored in a `Map` in the server process; lost on restart.
**Why**: Single-user local app. Persistence adds complexity for minimal gain. User re-authorizes on restart.

### localStorage for conversation history
**Decision**: Store up to 50 conversations in `localStorage`.
**Why**: Survives page refresh with zero backend complexity. Fits the local-first, no-backend constraint.

### HTML-only MCP resource proxy
**Decision**: `/api/mcp/resource/:serverId` only proxies HTML content.
**Why**: The only current use case is iframe rendering. Proxying arbitrary binary resources adds attack surface with no benefit.
