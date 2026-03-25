# MCP Chat

A lightweight, local-first chat client that connects to [MCP](https://modelcontextprotocol.io/) servers and streams responses from OpenAI or Ollama models. Single-user, no cloud backend — conversations persist in localStorage, OAuth tokens live in-memory on the server.

MCP apps built for ChatGPT (using the ChatGPT Apps SDK `window.openai` bridge) work unmodified inside the iframe renderer.

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
client/       React frontend — chat UI, conversation management, iframe bridge
shared/       Shared TypeScript types
specs/        Feature specs and architecture docs
config.yaml   Runtime config (gitignored, copy from config.example.yaml)
```

**Key design points:**

- `MCPClientManager` manages all MCP connections server-side; auto-connects non-OAuth servers at startup
- Tool names are namespaced as `{serverId}__{toolName}` to avoid collisions
- HTTP MCP servers try StreamableHTTP first, fall back to SSE
- OAuth2 uses Authorization Code + PKCE with RFC 7591 dynamic client registration
- No database — conversations in localStorage (max 50), OAuth tokens in-memory

For full architecture details, see [specs/architecture.md](specs/architecture.md).

## Configuration

All configuration lives in `config.yaml` at the project root. No environment variables are required.

| Section | Purpose |
|---------|---------|
| `llm.openai` | OpenAI API key, default model, system prompt |
| `llm.ollama` | Ollama base URL, system prompt |
| `mcp_servers` | MCP server definitions (stdio, HTTP, or HTTP+OAuth) |

See [config.example.yaml](config.example.yaml) for the full reference.
