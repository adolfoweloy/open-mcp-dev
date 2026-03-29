# MCP Chat

A lightweight, local-first chat client that connects to [MCP](https://modelcontextprotocol.io/) servers and streams responses from OpenAI or Ollama models. Single-user, no cloud backend — conversations persist in localStorage, OAuth tokens live in-memory on the server.

MCP tools can render interactive UI widgets inside sandboxed iframes. The iframe protocol is compatible with the ChatGPT Apps SDK.

## Getting started

```bash
# Install dependencies (npm workspaces)
npm install

# Create your config file
cp config.example.yaml config.yaml
```

Edit `config.yaml` to add at least one LLM provider:

```yaml
llm:
  openai:
    api_key: "sk-..."
    default_model: "gpt-4o"
  ollama:
    base_url: "http://localhost:11434"  # default
```

Optionally add MCP servers under `mcp_servers:` — see `config.example.yaml` for stdio, HTTP, and OAuth examples.

## How to run

Start both the Express server (port 3000) and the Vite dev server (port 5173):

```bash
# In separate terminals:
npm run dev:server
npm run dev:client
```

Then open `http://localhost:5173`. The Vite dev server proxies `/api/*` requests to Express.

## How to build

```bash
npm run build
```

This compiles the server with `tsc` and builds the client with Vite. In production, Express serves the Vite build as static files.

## How to test

```bash
npm test
```

Server tests use Node's built-in test runner; client tests use Vitest.

## How to lint

```bash
npm run lint        # TypeScript type-checking (both workspaces)
npm run typecheck   # Same as lint
```

## Architecture overview

| Layer | Tech |
|-------|------|
| Server | Node.js + Express 4 + TypeScript |
| Client | React 19 + Vite 6 + Tailwind CSS 4 |
| LLM streaming | Vercel AI SDK (`ai` v4) |
| MCP client | `@modelcontextprotocol/sdk` v1 |
| Config | `config.yaml` (single file, gitignored) |

**Directory structure:**

```
server/       Express backend — chat streaming, MCP client management, OAuth
client/       React frontend — chat UI, conversation management, iframe widgets
shared/       Shared TypeScript types
specs/        Feature specs and architecture docs
config.yaml   Runtime config (gitignored, copy from config.example.yaml)
```

### Request flow

1. The user sends a message; the client POSTs to `/api/chat` with the conversation history, selected model, and active MCP server list.
2. The server calls `streamText` (Vercel AI SDK, `maxSteps: 20`) with all tools from connected MCP servers injected.
3. When the LLM invokes a tool, the execute wrapper calls `client.callTool(...)` on the relevant `MCPClientManager` connection and returns the result for the next LLM step.
4. The stream is returned to the client as a Vercel AI SDK data stream (`text/plain`, `X-Vercel-AI-Data-Stream: v1`); debug events (LLM steps, tool calls, OAuth flows) are multiplexed into the same stream.

### MCP connections

`MCPClientManager` owns all MCP client connections server-side:
- STDIO servers use `StdioClientTransport`; HTTP servers try `StreamableHTTPClientTransport` first, then fall back to `SSEClientTransport`
- Tool names are namespaced as `{serverId}__{toolName}` (hyphens in tool names become underscores)
- OAuth2 servers use Authorization Code + PKCE with RFC 7591 dynamic client registration; token refresh and 401 queuing are automatic

### MCP UI widgets

When a tool result includes `_meta["ui/resourceUri"]`, the chat UI renders a sandboxed iframe. The iframe `src` is proxied through `/api/mcp/resource/{serverId}?uri=...`, which fetches the MCP resource HTML server-side and returns it directly.

The widget communicates with the host via JSON-RPC 2.0 `postMessage`. The handshake is widget-initiated (`ui/initialize`); after the host responds the widget receives the tool arguments and result. From there the widget can:
- Call tools directly (`tools/call`) without involving the LLM
- Send a follow-up user message (`ui/message`) to trigger a new LLM turn
- Request fullscreen (`ui/request-display-mode`)

### Model selection

`GET /api/models` returns the union of configured OpenAI models and live Ollama models (fetched from the Ollama `/api/tags` endpoint). Both providers are driven via `@ai-sdk/openai` — Ollama's native AI SDK provider is avoided because it silently drops tool-call tokens. System prompts are configured per provider in `config.yaml`.

For full architecture details, see [specs/architecture.md](specs/architecture.md).

## Configuration

All configuration lives in `config.yaml` at the project root. No environment variables are required.

| Section | Purpose |
|---------|---------|
| `llm.openai` | OpenAI API key, default model, system prompt |
| `llm.ollama` | Ollama base URL, system prompt |
| `mcp_servers` | MCP server definitions (stdio, HTTP, or HTTP+OAuth) |

See [config.example.yaml](config.example.yaml) for the full reference.
