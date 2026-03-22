<!-- spec_id: root__initial_scope -->
<!-- domain: root -->
<!-- feature: initial_scope -->
<!-- spec_dir: specs/root/initial_scope -->

## Import Mode

The user has provided an existing spec file as a starting point.
Your goal is to review it, ask clarifying questions to fill in any gaps
(functional requirements, non-functional requirements, edge cases, constraints),
and then rewrite it in the Fabrikets spec format.

## Existing Spec

# MCP Chat Client — Project Specification

A lightweight, local-first MCP chat client. No cloud backend, no analytics, no multi-user complexity. Just a chat interface that connects to MCP servers and uses OpenAI or Ollama models.

---

## Goals & Non-Goals

**In scope:**
- Chat UI with streaming LLM responses
- OpenAI (API key) and Ollama (local) model support configured via `config.yaml`
- MCP server connections configured via `config.yaml` (STDIO and HTTP/SSE transports)
- MCP resource UI rendering (iframes / embedded webviews served by MCP servers)
- OAuth2 Authorization Code + PKCE flow for MCP servers that require it

**Out of scope:**
- User accounts, authentication, sessions
- Analytics, error tracking, telemetry
- Cloud backend, database, persistence
- Multi-user support
- Any LLM provider other than OpenAI and Ollama

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend runtime | Node.js + TypeScript | Same as reference project |
| Backend framework | Express | User preference |
| Frontend | React + TypeScript + Vite | Same as reference project |
| Styling | Tailwind CSS | User preference |
| LLM streaming | Vercel AI SDK (`ai`) | Battle-tested, handles streaming, multi-step tool calls |
| MCP client | `@modelcontextprotocol/sdk` | Official MCP SDK, has OAuth helpers |
| Config parsing | `js-yaml` | YAML config file |
| Build | `tsx` (dev), `tsc` (prod) | Simple TS execution |

---

## Configuration (`config.yaml`)

Single file at the project root. No UI needed for setup.

```yaml
# config.yaml

llm:
  openai:
    api_key: "sk-..."
    default_model: "gpt-4o"     # optional, defaults to gpt-4o
  ollama:
    base_url: "http://127.0.0.1:11434"  # optional, this is the default

mcp_servers:
  pipoca:
    type: http                          # "http" or "stdio"
    url: "https://mcp.pipoca.com/mcp"
    oauth: true                         # triggers OAuth2 flow on connect

  filesystem:
    type: stdio
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]

  local-api:
    type: http
    url: "http://localhost:8080/mcp"
    # no oauth: plain HTTP with no auth
```

### Config schema (TypeScript)

```typescript
interface Config {
  llm: {
    openai?: { api_key: string; default_model?: string };
    ollama?: { base_url?: string };
  };
  mcp_servers: Record<string, McpServerConfig>;
}

type McpServerConfig =
  | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; oauth?: boolean };
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Browser (React + Tailwind)                         │
│                                                     │
│  ┌──────────────┐  ┌────────────────────────────┐  │
│  │  Chat UI     │  │  MCP Resource Frame        │  │
│  │  (messages,  │  │  (iframe rendered when MCP │  │
│  │   tool calls,│  │   server returns a UI       │  │
│  │   model sel) │  │   resource)                │  │
│  └──────┬───────┘  └────────────────────────────┘  │
│         │ POST /api/chat (streaming)               │
└─────────┼───────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────┐
│  Express Server (Node.js)                           │
│                                                     │
│  POST /api/chat         → LLM streaming + tool exec │
│  GET  /api/models       → list available models     │
│  POST /api/mcp/connect  → connect MCP server        │
│  GET  /api/mcp/tools    → list tools for a server   │
│  POST /api/mcp/call     → call a tool directly      │
│  GET  /api/oauth/start  → begin OAuth2 flow         │
│  GET  /api/oauth/callback → handle OAuth2 callback  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  MCPClientManager (one instance)            │   │
│  │  - manages N server connections             │   │
│  │  - handles tool execution                   │   │
│  │  - stores OAuth tokens per server           │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
          │
    ┌─────┴──────┐
    │ MCP Servers│  (local STDIO or remote HTTP/SSE)
    └────────────┘
```

---

## Feature 1: Chat

### How it works (modelled on the reference project)

1. **Client** sends `POST /api/chat` with:
   - `messages`: full conversation history (Vercel AI SDK `UIMessage[]` format)
   - `model`: `{ provider: "openai" | "ollama", id: "gpt-4o" | "llama3.2" }`
   - `selectedServers`: string[] of server IDs to include tools from

2. **Server** uses the Vercel AI SDK `streamText()` function:
   - Creates the LLM model instance from config
   - Fetches all tools from selected MCP servers
   - Streams response back as `UIMessageStream` (SSE-like)
   - Handles multi-step agentic loop (up to 20 steps) — model calls tools, results go back, model continues

3. **Client** uses the Vercel AI SDK `useChat()` hook to consume the stream and render messages.

### Tool execution flow

When the LLM decides to call an MCP tool:
1. `streamText()` invokes the tool handler on the server
2. The handler calls `mcpClient.callTool(toolName, args)` on the appropriate server
3. Result flows back into the LLM context automatically (multi-step)
4. If the tool result contains a UI resource, the client renders it in an iframe

### Key packages

```json
{
  "ai": "^6.x",
  "@ai-sdk/openai": "^1.x",
  "ollama-ai-provider-v2": "^1.x"
}
```

### Server-side chat route (`server/routes/chat.ts`)

```typescript
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";

router.post("/chat", async (req, res) => {
  const { messages, model, selectedServers } = req.body;

  const llm = createModel(model, config); // reads api_key / base_url from config
  const tools = await buildToolSet(mcpClientManager, selectedServers);

  const result = streamText({
    model: llm,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(20),
    onError: (err) => console.error("[chat]", err),
  });

  // Express streaming response
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Vercel-AI-Data-Stream", "v1");
  result.pipeUIMessageStreamToResponse(res);
});
```

### Model factory (`server/lib/models.ts`)

```typescript
export function createModel(model: ModelSelection, config: Config) {
  if (model.provider === "openai") {
    const openai = createOpenAI({ apiKey: config.llm.openai!.api_key });
    return openai(model.id);
  }
  if (model.provider === "ollama") {
    const baseUrl = (config.llm.ollama?.base_url ?? "http://127.0.0.1:11434") + "/api";
    const ollama = createOllama({ baseURL: baseUrl });
    return ollama(model.id);
  }
  throw new Error(`Unsupported provider: ${model.provider}`);
}
```

---

## Feature 2: Model Selection

No setup UI needed — API keys come from `config.yaml`. The frontend only needs a dropdown to pick which model to use.

### `GET /api/models` response

```json
{
  "models": [
    { "provider": "openai", "id": "gpt-4o",       "label": "GPT-4o" },
    { "provider": "openai", "id": "gpt-4o-mini",  "label": "GPT-4o mini" },
    { "provider": "ollama", "id": "llama3.2",     "label": "llama3.2 (local)" }
  ]
}
```

**Logic:**
- If `config.llm.openai` is set → include a hardcoded list of common OpenAI models
- If `config.llm.ollama` is set → call `GET {base_url}/api/tags` to fetch installed models dynamically

### Ollama model discovery

```typescript
// server/lib/ollama.ts
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.models?.map((m: any) => m.name) ?? [];
}
```

### Frontend model selector

Simple `<select>` component populated from `GET /api/models`. Persisted in React state (ephemeral — resets on refresh). Default: first model in the list.

---

## Feature 3: MCP Server Configuration

Servers are declared in `config.yaml`. At startup, the Express server reads the config and initializes the `MCPClientManager`.

### MCP Client Manager (`server/lib/mcp-manager.ts`)

Full implementation using `@modelcontextprotocol/sdk` directly, modelled on `@mcpjam/sdk`'s `MCPClientManager`.

**Key behaviors replicated from `@mcpjam/sdk`:**
- State map holding `client`, `transport`, `promise` (in-flight), `config`, `timeout` per server
- HTTP transport fallback: tries `StreamableHTTPClientTransport` first, falls back to `SSEClientTransport`
- OAuth: supports `accessToken` (static Bearer), `authProvider` (custom `OAuthClientProvider`), and `refreshToken` (auto-refresh via `RefreshTokenOAuthProvider`)
- `ensureConnected()` waits for in-flight connection if one is already underway
- Graceful `listTools()` — returns `[]` if server doesn't support `tools/list`
- Vercel AI SDK tool conversion with proper JSON Schema normalization (Anthropic requires `type: "object"`)

```typescript
// server/lib/mcp-manager.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, tool as defineTool, type ToolSet } from "ai";

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type StdioServerConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
};

export type HttpServerConfig = {
  type: "http";
  url: string;
  /** Static Bearer token. Mutually exclusive with refreshToken / authProvider. */
  accessToken?: string;
  /** OAuth refresh token. Requires clientId. Mutually exclusive with accessToken / authProvider. */
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  /** Custom OAuth provider. Mutually exclusive with accessToken / refreshToken. */
  authProvider?: OAuthClientProvider;
  /** Force SSE transport (skip StreamableHTTP attempt). */
  preferSSE?: boolean;
  timeout?: number;
};

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type ManagedState = {
  config: McpServerConfig;
  client?: Client;
  transport?: Transport;
  /** In-flight connection promise — prevents duplicate connects. */
  promise?: Promise<Client>;
  timeout: number;
};

type ConnectionStatus = "connected" | "connecting" | "disconnected";

const DEFAULT_TIMEOUT = 60_000;
const HTTP_CONNECT_TIMEOUT = 10_000;

// ---------------------------------------------------------------------------
// RefreshTokenOAuthProvider
// Mirrors @mcpjam/sdk's implementation — uses a stored refresh token to
// obtain new access tokens without a browser redirect.
// ---------------------------------------------------------------------------

class RefreshTokenOAuthProvider implements OAuthClientProvider {
  private currentRefreshToken: string;
  private currentTokens?: OAuthTokens;

  constructor(
    private readonly _clientId: string,
    refreshToken: string,
    private readonly _clientSecret?: string,
  ) {
    this.currentRefreshToken = refreshToken;
  }

  get redirectUrl(): string { return ""; }

  get clientMetadata(): OAuthClientMetadata {
    return { redirect_uris: [], grant_types: ["refresh_token"] };
  }

  clientInformation() {
    return this._clientSecret
      ? { client_id: this._clientId, client_secret: this._clientSecret }
      : { client_id: this._clientId };
  }

  tokens() { return this.currentTokens; }

  saveTokens(tokens: OAuthTokens) {
    this.currentTokens = tokens;
    if (tokens.refresh_token) this.currentRefreshToken = tokens.refresh_token;
  }

  prepareTokenRequest() {
    return new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.currentRefreshToken,
    });
  }

  redirectToAuthorization(): never {
    throw new Error("Non-interactive OAuth flow — use refreshToken only.");
  }

  saveCodeVerifier() { /* no-op */ }
  codeVerifier(): never { throw new Error("Non-interactive OAuth flow."); }
}

// ---------------------------------------------------------------------------
// JSON Schema normalization
// Mirrors @mcpjam/sdk's ensureJsonSchemaObject() — Anthropic requires
// the top-level schema to have type: "object".
// ---------------------------------------------------------------------------

function normalizeJsonSchema(schema: unknown): Record<string, unknown> {
  const base =
    schema && typeof schema === "object"
      ? (schema as Record<string, unknown>)
      : {};

  if (!("type" in base) || base.type === undefined) {
    base.type = "object";
  }
  if (base.type === "object") {
    base.properties = (base.properties as Record<string, unknown>) ?? {};
    if (base.additionalProperties === undefined) {
      base.additionalProperties = false;
    }
  }
  return base;
}

// ---------------------------------------------------------------------------
// MCPClientManager
// ---------------------------------------------------------------------------

export class MCPClientManager {
  private readonly states = new Map<string, ManagedState>();

  // -------------------------------------------------------------------------
  // Server lifecycle
  // -------------------------------------------------------------------------

  async connectToServer(id: string, config: McpServerConfig): Promise<Client> {
    const existing = this.states.get(id);

    if (existing?.client) {
      throw new Error(`MCP server "${id}" is already connected.`);
    }

    // Reuse in-flight promise to avoid duplicate connects.
    if (existing?.promise) return existing.promise;

    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    const state: ManagedState = existing ?? { config, timeout };
    state.config = config;
    state.timeout = timeout;

    const promise = this.performConnect(id, config, timeout, state);
    state.promise = promise;
    this.states.set(id, state);
    return promise;
  }

  async disconnectServer(id: string): Promise<void> {
    const state = this.states.get(id);
    if (!state?.client) return;
    try {
      await state.client.close();
    } catch { /* ignore */ } finally {
      if (state.transport) await this.safeClose(state.transport);
      this.states.delete(id);
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.states.keys()].map((id) => this.disconnectServer(id)));
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  listServers(): string[] {
    return [...this.states.keys()];
  }

  getConnectionStatus(id: string): ConnectionStatus {
    const s = this.states.get(id);
    if (s?.promise && !s.client) return "connecting";
    if (s?.client) return "connected";
    return "disconnected";
  }

  getServerCapabilities(id: string): ServerCapabilities | undefined {
    return this.states.get(id)?.client?.getServerCapabilities();
  }

  getClient(id: string): Client | undefined {
    return this.states.get(id)?.client;
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  /**
   * Lists raw MCP tools for a server.
   * Returns [] gracefully if the server doesn't support tools/list.
   */
  async listTools(serverId: string) {
    await this.ensureConnected(serverId);
    const client = this.clientOrThrow(serverId);
    try {
      return await client.listTools();
    } catch (err) {
      if (isMethodNotFound(err)) return { tools: [] };
      throw err;
    }
  }

  /**
   * Executes a tool on a server.
   */
  async executeTool(serverId: string, toolName: string, args: Record<string, unknown> = {}) {
    await this.ensureConnected(serverId);
    const client = this.clientOrThrow(serverId);
    return client.callTool({ name: toolName, arguments: args }, CallToolResultSchema);
  }

  /**
   * Returns tools from the given servers (or all connected servers) formatted
   * for Vercel AI SDK's streamText() / generateText().
   *
   * Tool names are namespaced as "{serverId}__{toolName}" to avoid collisions
   * when multiple servers expose tools with the same name.
   */
  async getToolsForAiSdk(serverIds?: string[]): Promise<ToolSet> {
    const ids = serverIds ?? this.listServers();
    const toolSet: ToolSet = {};

    await Promise.all(
      ids.map(async (id) => {
        const { tools } = await this.listTools(id);
        for (const mcpTool of tools) {
          const key = `${id}__${mcpTool.name}`;
          toolSet[key] = defineTool({
            description: mcpTool.description ?? "",
            parameters: jsonSchema(normalizeJsonSchema(mcpTool.inputSchema)),
            execute: async (args) => {
              const result = await this.executeTool(id, mcpTool.name, args as Record<string, unknown>);
              return result.content;
            },
          });
        }
      }),
    );

    return toolSet;
  }

  // -------------------------------------------------------------------------
  // Resources (needed for MCP UI rendering)
  // -------------------------------------------------------------------------

  async listResources(serverId: string) {
    await this.ensureConnected(serverId);
    const client = this.clientOrThrow(serverId);
    try {
      return await client.listResources();
    } catch (err) {
      if (isMethodNotFound(err)) return { resources: [] };
      throw err;
    }
  }

  async readResource(serverId: string, uri: string) {
    await this.ensureConnected(serverId);
    const client = this.clientOrThrow(serverId);
    return client.readResource({ uri });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async performConnect(
    id: string,
    config: McpServerConfig,
    timeout: number,
    state: ManagedState,
  ): Promise<Client> {
    try {
      const client = new Client({ name: "mcp-chat", version: "1.0.0" });
      client.onclose = () => this.states.delete(id);

      let transport: Transport;
      if (config.type === "stdio") {
        transport = await this.connectStdio(client, config, timeout);
      } else {
        transport = await this.connectHttp(id, client, config, timeout);
      }

      state.client = client;
      state.transport = transport;
      state.promise = undefined;
      this.states.set(id, state);
      return client;
    } catch (err) {
      this.states.delete(id);
      throw err;
    }
  }

  private async connectStdio(
    client: Client,
    config: StdioServerConfig,
    timeout: number,
  ): Promise<Transport> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...getDefaultEnvironment(), ...(config.env ?? {}) },
    });
    await client.connect(transport, { timeout });
    return transport;
  }

  private async connectHttp(
    id: string,
    client: Client,
    config: HttpServerConfig,
    timeout: number,
  ): Promise<Transport> {
    const url = new URL(config.url);

    // Resolve auth provider
    let authProvider: OAuthClientProvider | undefined = config.authProvider;
    if (config.refreshToken) {
      if (!config.clientId) throw new Error(`Server "${id}": clientId required with refreshToken.`);
      authProvider = new RefreshTokenOAuthProvider(
        config.clientId,
        config.refreshToken,
        config.clientSecret,
      );
    }

    // Build requestInit with static Bearer token if provided
    const requestInit = config.accessToken
      ? { headers: { Authorization: `Bearer ${config.accessToken}` } }
      : undefined;

    const preferSSE = config.preferSSE ?? url.pathname.endsWith("/sse");

    // Try StreamableHTTP first (modern transport), fall back to SSE (legacy)
    if (!preferSSE) {
      const streamable = new StreamableHTTPClientTransport(url, {
        requestInit,
        authProvider,
      });
      try {
        await client.connect(streamable, { timeout: Math.min(timeout, HTTP_CONNECT_TIMEOUT) });
        return streamable;
      } catch (streamableErr) {
        await this.safeClose(streamable);
        // Fall through to SSE
      }
    }

    const sse = new SSEClientTransport(url, { requestInit, authProvider });
    try {
      await client.connect(sse, { timeout });
      return sse;
    } catch (sseErr) {
      await this.safeClose(sse);
      throw new Error(
        `Failed to connect to MCP server "${id}". ` +
        `Tried StreamableHTTP and SSE transports. Last error: ${sseErr instanceof Error ? sseErr.message : String(sseErr)}`,
      );
    }
  }

  private async ensureConnected(id: string): Promise<void> {
    const state = this.states.get(id);
    if (!state) throw new Error(`Unknown MCP server "${id}".`);
    if (state.client) return;
    if (state.promise) { await state.promise; return; }
    await this.connectToServer(id, state.config);
  }

  private clientOrThrow(id: string): Client {
    const client = this.states.get(id)?.client;
    if (!client) throw new Error(`MCP server "${id}" is not connected.`);
    return client;
  }

  private async safeClose(transport: Transport): Promise<void> {
    try { await transport.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMethodNotFound(err: unknown): boolean {
  // MCP returns JSON-RPC error code -32601 for unsupported methods
  return (
    err instanceof Error &&
    ((err as any).code === -32601 || err.message.includes("Method not found"))
  );
}
```

### How the chat route uses it (`server/routes/chat.ts`)

```typescript
const tools = await mcpManager.getToolsForAiSdk(selectedServers);

const result = streamText({
  model: llm,
  messages: await convertToModelMessages(messages),
  tools,
  stopWhen: stepCountIs(20),
});
```

No separate `buildToolSet()` helper needed — `getToolsForAiSdk()` on the manager handles everything.

### Server startup auto-connect

At startup, connect all non-OAuth servers immediately. OAuth servers are connected lazily when the user completes the auth flow.

```typescript
// server/index.ts
const config = loadConfig("./config.yaml");
const mcpManager = new MCPClientManager();

for (const [id, serverConfig] of Object.entries(config.mcp_servers)) {
  if (serverConfig.type === "http" && serverConfig.oauth) {
    // Skip — will be connected after OAuth flow
    continue;
  }
  await mcpManager.connectServer(id, serverConfig).catch(err =>
    console.warn(`[mcp] Failed to connect ${id}:`, err.message)
  );
}
```

---

## Feature 4: MCP Resource UI Rendering

Some MCP tools return resources with embedded HTML/UI content. The reference project renders these as iframes inside the chat.

### How it works

When the LLM calls a tool and the result contains a resource with a `uri` that points to an HTML page served by the MCP server, the frontend detects this and renders an iframe.

### Detection logic (frontend)

After a tool call result arrives in the chat, inspect the content:

```typescript
function getResourceUrl(toolResult: ToolResult): string | null {
  for (const item of toolResult.content ?? []) {
    if (item.type === "resource" && item.resource?.uri) {
      return item.resource.uri; // e.g. "mcp://pipoca/dashboard"
    }
    if (item.type === "text" && item.text?.startsWith("data:text/html")) {
      return item.text; // data URL
    }
  }
  return null;
}
```

### Proxy for MCP resource URLs (`server/routes/mcp-proxy.ts`)

Since MCP resource URIs may use the `mcp://` scheme or point to the MCP server's origin, the backend proxies them for the iframe:

```
GET /api/mcp/resource/:serverId?uri=<encoded-uri>
```

The server fetches the resource from the MCP server (using the stored OAuth token if applicable) and streams it back. The iframe `src` points to this proxy URL, not the MCP server directly. This avoids CORS and keeps auth tokens server-side.

### Frontend iframe component

```tsx
function McpResourceFrame({ url }: { url: string }) {
  return (
    <iframe
      src={url}
      sandbox="allow-scripts allow-forms allow-same-origin"
      className="w-full h-64 rounded border border-zinc-700"
    />
  );
}
```

Render this inside a tool result bubble when a resource URL is detected.

---

## Feature 5: OAuth2 for MCP Servers

This is for the use case where your MCP server (e.g. `mcp.pipoca.com`) requires users to authorize it before it can make API calls on their behalf — exactly like "Sign in with Pipoca" in an OAuth sense.

### Protocol

The MCP spec defines OAuth2 Authorization Code + PKCE for HTTP-based MCP servers. The reference project implements this via `@modelcontextprotocol/sdk/client/auth.js`. Use the same approach.

### Full OAuth flow

```
User clicks "Connect pipoca server"
       │
       ▼
Server: GET /api/oauth/start?server=pipoca
  1. Read server URL from config
  2. Discover OAuth metadata:
     - Try GET {server_url}/.well-known/oauth-authorization-server
     - Try GET {server_url}/.well-known/openid-configuration
  3. Dynamic Client Registration (DCR):
     - POST {metadata.registration_endpoint} with client metadata
     - OR use pre-configured client_id/secret from config.yaml
  4. Generate PKCE code_verifier + code_challenge (S256)
  5. Build authorization URL with state, code_challenge
  6. Store (code_verifier, state) in server-side session (in-memory Map)
  7. Redirect browser to authorization URL
       │
       ▼
Browser: User logs in on Pipoca's auth page, approves scopes
       │
       ▼
Browser redirected to: GET /api/oauth/callback?code=xxx&state=yyy
  1. Validate state matches stored session
  2. Exchange code for tokens:
     POST {metadata.token_endpoint}
       grant_type=authorization_code
       code=xxx
       code_verifier=<stored verifier>
       redirect_uri=http://localhost:3000/api/oauth/callback
  3. Store tokens in memory (Map<serverId, OAuthTokens>)
  4. Connect MCP server with token:
     Authorization: Bearer <access_token>
  5. Redirect browser to frontend "/"
       │
       ▼
Frontend: server appears as connected
```

### Server-side implementation

```typescript
// server/routes/oauth.ts

const pendingSessions = new Map<string, { serverId: string; codeVerifier: string; state: string }>();
const oauthTokens = new Map<string, OAuthTokens>();

router.get("/oauth/start", async (req, res) => {
  const serverId = req.query.server as string;
  const serverConfig = config.mcp_servers[serverId] as HttpMcpServerConfig;

  // 1. Discover metadata using @modelcontextprotocol/sdk
  const metadata = await discoverOAuthMetadata(serverConfig.url);

  // 2. Dynamic client registration
  let clientInfo = await registerClient(serverConfig.url, {
    metadata,
    clientMetadata: {
      client_name: "MCP Chat",
      redirect_uris: ["http://localhost:3000/api/oauth/callback"],
    },
  });

  // 3. PKCE + authorization URL
  const { authorizationUrl, codeVerifier } = await startAuthorization(serverConfig.url, {
    metadata,
    clientInformation: clientInfo,
    redirectUrl: "http://localhost:3000/api/oauth/callback",
  });

  const state = authorizationUrl.searchParams.get("state")!;
  pendingSessions.set(state, { serverId, codeVerifier, state });

  res.redirect(authorizationUrl.toString());
});

router.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query as { code: string; state: string };
  const session = pendingSessions.get(state);
  if (!session) return res.status(400).send("Invalid state");
  pendingSessions.delete(state);

  const serverConfig = config.mcp_servers[session.serverId] as HttpMcpServerConfig;
  const metadata = await discoverOAuthMetadata(serverConfig.url);

  const tokens = await exchangeAuthorization(serverConfig.url, {
    metadata,
    clientInformation: clientInfo, // must be stored from /oauth/start
    authorizationCode: code,
    codeVerifier: session.codeVerifier,
    redirectUri: "http://localhost:3000/api/oauth/callback",
  });

  oauthTokens.set(session.serverId, tokens);
  await mcpManager.connectServer(session.serverId, serverConfig, tokens);

  res.redirect("/");
});
```

### Token refresh

When a tool call fails with 401, attempt token refresh:

```typescript
async function callToolWithRefresh(serverId, toolName, args) {
  try {
    return await mcpManager.callTool(serverId, toolName, args);
  } catch (err) {
    if (isAuthError(err)) {
      const refreshed = await refreshTokens(serverId);
      if (refreshed) {
        await mcpManager.reconnectServer(serverId, refreshed);
        return mcpManager.callTool(serverId, toolName, args);
      }
    }
    throw err;
  }
}
```

### config.yaml for OAuth servers (optional override)

If the MCP server does NOT support Dynamic Client Registration, pre-configure the client:

```yaml
mcp_servers:
  pipoca:
    type: http
    url: "https://mcp.pipoca.com/mcp"
    oauth: true
    client_id: "my-registered-client-id"     # optional, for pre-registered clients
    client_secret: "my-secret"               # optional
```

---

## Project Directory Structure

```
mcp-chat/
├── config.yaml                    # User config (gitignored)
├── config.example.yaml            # Template to copy
├── package.json
├── tsconfig.json
│
├── server/
│   ├── index.ts                   # Express app entry, startup
│   ├── config.ts                  # Load & validate config.yaml
│   ├── routes/
│   │   ├── chat.ts                # POST /api/chat
│   │   ├── models.ts              # GET /api/models
│   │   ├── mcp.ts                 # POST /api/mcp/connect, GET /api/mcp/tools
│   │   ├── mcp-proxy.ts           # GET /api/mcp/resource/:serverId
│   │   └── oauth.ts               # GET /api/oauth/start, /api/oauth/callback
│   └── lib/
│       ├── mcp-manager.ts         # MCPClientManager class
│       ├── tools.ts               # buildToolSet() for Vercel AI SDK
│       ├── models.ts              # createModel() factory
│       └── ollama.ts              # listOllamaModels()
│
├── client/
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── Chat.tsx            # Main chat component, uses useChat()
│       │   ├── MessageList.tsx     # Renders message thread
│       │   ├── MessageBubble.tsx   # Individual message with tool call rendering
│       │   ├── ToolCallResult.tsx  # Renders tool call + result, detects UI resources
│       │   ├── McpResourceFrame.tsx # iframe for MCP UI resources
│       │   ├── ModelSelector.tsx   # Dropdown to pick model
│       │   └── ServerStatus.tsx    # Shows which MCP servers are connected
│       └── lib/
│           ├── api.ts              # fetch wrappers for backend endpoints
│           └── types.ts            # Shared frontend types
│
└── shared/
    └── types.ts                   # Types shared between client and server
```

---

## API Contracts

### `POST /api/chat`

**Request:**
```json
{
  "messages": [ /* Vercel AI SDK UIMessage[] */ ],
  "model": { "provider": "openai", "id": "gpt-4o" },
  "selectedServers": ["pipoca", "filesystem"]
}
```

**Response:** `text/plain` stream in Vercel AI SDK UIMessage stream format (compatible with `useChat()`).

---

### `GET /api/models`

**Response:**
```json
{
  "models": [
    { "provider": "openai", "id": "gpt-4o", "label": "GPT-4o" },
    { "provider": "ollama", "id": "llama3.2", "label": "llama3.2 (local)" }
  ]
}
```

---

### `GET /api/mcp/servers`

**Response:**
```json
{
  "servers": [
    { "id": "pipoca", "connected": true,  "requiresOAuth": true },
    { "id": "filesystem", "connected": true,  "requiresOAuth": false },
    { "id": "local-api",  "connected": false, "requiresOAuth": false }
  ]
}
```

---

### `GET /api/oauth/start?server=pipoca`

Redirects the browser to the OAuth authorization URL. No JSON response.

### `GET /api/oauth/callback?code=xxx&state=yyy`

Handles the OAuth callback, exchanges code for tokens, connects the server, redirects to `/`.

---

## Key Dependencies

```json
{
  "dependencies": {
    "express": "^4.x",
    "ai": "^6.x",
    "@ai-sdk/openai": "^1.x",
    "ollama-ai-provider-v2": "^1.x",
    "@modelcontextprotocol/sdk": "^1.x",
    "js-yaml": "^4.x",
    "zod": "^3.x",
    "cors": "^2.x"
  },
  "devDependencies": {
    "vite": "^6.x",
    "@vitejs/plugin-react": "^4.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "tailwindcss": "^4.x",
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

---

## Implementation Notes

### OAuth SDK functions to use

From `@modelcontextprotocol/sdk/client/auth.js` — these are exactly what the reference project uses:

- `discoverOAuthProtectedResourceMetadata(serverUrl)` — checks for `/.well-known/oauth-protected-resource`
- `discoverOAuthMetadata(authServerUrl)` — tries both OAuth2 and OIDC discovery endpoints
- `registerClient(serverUrl, { metadata, clientMetadata })` — Dynamic Client Registration
- `startAuthorization(serverUrl, { metadata, clientInformation, redirectUrl, scope })` — generates PKCE verifier + auth URL
- `exchangeAuthorization(serverUrl, { metadata, clientInformation, authorizationCode, codeVerifier, redirectUri })` — token exchange

### PKCE implementation

The MCP SDK handles PKCE internally inside `startAuthorization()`. It generates a `code_verifier` and computes `code_challenge` using S256 (SHA-256). You just need to store the returned `codeVerifier` and pass it back to `exchangeAuthorization()`.

### MCP resource UI detection

Tool results from the MCP SDK have this shape:

```typescript
type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string } }
  >;
};
```

Render an iframe when you encounter `type: "resource"` with `mimeType: "text/html"` or when the `uri` scheme is `mcp://`.

### Express streaming with Vercel AI SDK

The Vercel AI SDK's `streamText()` returns a result with a `.pipeUIMessageStreamToResponse(res)` method that works directly with Node.js `http.ServerResponse` (which Express `res` extends). This is the cleanest integration.

### Token storage

Since this is a single-user local app, store OAuth tokens in-memory (a `Map` in the server process). They will be lost on server restart — the user will need to re-authorize. If persistence is later desired, write them to a local `.tokens.json` file (gitignored).

### CORS

Since Vite dev server (port 5173) talks to Express (port 3000), configure CORS:

```typescript
app.use(cors({ origin: "http://localhost:5173" }));
```

In production, Vite builds static files that Express serves directly — no CORS needed.


---

# Instructions: Spec Creation Interview

You are helping the user define a new specification for their project.
This is a multi-turn interview. Each time you respond, your reply and the user's answer
are appended to this file and sent back to you. You will see the full conversation history
below under "Conversation so far".

## Configuration

Your current working directory is already the project src directory (see `fabrikets_src` in the context header).
All file paths are relative to here. Do not navigate outside this directory.

The spec metadata is in the comments at the top of this file:
- `spec_id` — the identifier for this spec (format: `domain__feature`)
- `domain` — the domain group
- `feature` — the feature name
- `spec_dir` — the directory where spec files will be written (e.g. `specs/auth/user_login/`)

## Step 1: Understand the Project

Before asking anything, read the existing context:

- Read `specs/architecture.md` if it exists — understand the global architecture decisions and patterns already established
- Read `specs/specs.yaml` if it exists — understand what's already specified and the status of each
- For 1-2 existing specs, read their `overview.md` to understand the format and level of detail
- Glance at the src directory to understand what's already been built (README, folder structure, key source files)

If none of these exist yet, you're starting a brand new project.

## Step 2: Interview the User

Ask questions in a structured format. Each response should contain one or more numbered
questions, each with lettered options. Always include a free-text option at the end:

```
1 - What is the primary goal of this feature?
  a. Automate an existing manual process
  b. Expose data to external consumers
  c. Other (describe below)

2 - How should errors be handled?
  a. Fail fast and surface to the user
  b. Retry silently in the background
  c. Log and continue
  d. Other (describe below)
```

The user will reply using the format: `1=a, 2=c, 3="my custom answer"`.
Parse their answers before asking the next set of questions.

Ask one round of questions at a time — no more than 3-4 questions per round.

### Functional Requirements

Cover the core behaviour of the feature:
- Primary use cases and user goals
- Inputs, outputs, and data flows
- Business rules and constraints
- Edge cases and error handling
- Interactions with existing components

### Non-Functional Requirements

Once functional requirements are clear, explicitly ask about:
- **Performance**: acceptable latency, throughput expectations
- **Scalability**: expected load now and in the future
- **Security**: authentication, authorisation, data sensitivity
- **Reliability**: acceptable downtime, consistency guarantees
- **Observability**: logging, metrics, alerting needs
- **Maintainability**: who owns this, how often will it change

### When to call the Architect

Once you have a solid picture of both functional and non-functional requirements,
output `[ARCHITECT]` on its own line. The system will automatically run an architect
subagent that reviews the requirements for tradeoffs and risks. Its findings will be
appended to this conversation as "Architect Review:" for you to incorporate before
writing the spec.

## Step 3: Write the Spec Files

Write three files to `<spec_dir>/`:

### `<spec_dir>/overview.md`

A concise 1-page summary of the feature. Must include:
- Purpose and scope (2-3 sentences)
- Key design decisions made
- Non-goals (what this explicitly does NOT do)
- References to the other files:
  ```
  - Requirements: [requirements.md](requirements.md)
  - Design: [design.md](design.md)
  ```

Keep this under ~100 lines. This file is always loaded — keep it tight.

### `<spec_dir>/requirements.md`

All functional and non-functional requirements. Structure as:

```markdown
## Functional Requirements

### <Use Case Name>
- <requirement>
- <requirement>

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | ... |
| Scalability | ... |
| Security | ... |
| Reliability | ... |
| Observability | ... |
```

Be specific and testable. No prose — bullet points and tables only.

### `<spec_dir>/design.md`

Design decisions, data model, interfaces, and component interactions:

```markdown
## Data Model
<types, schemas, or database tables>

## Interfaces
<API contracts, function signatures, message formats>

## Component Design
<how this fits into the existing architecture, key components, sequence flows>

## Key Decisions
<decisions made and why, with alternatives considered>
```

## Step 4: Update Global Architecture

Read `specs/architecture.md` (create if it doesn't exist).

Add or refine entries that reflect system-wide patterns, decisions, or constraints
established or confirmed by this spec. This file captures cross-cutting concerns that
affect multiple features — things like: chosen tech stack, data storage strategy,
auth model, API conventions, error handling patterns, deployment constraints.

Do NOT copy per-feature detail here. Only add what is genuinely global.

## Step 5: Register the Spec

Add the new entry to `specs/specs.yaml` (create if it doesn't exist):

```yaml
specs:
  - id: auth__user_login
    domain: auth
    feature: user_login
    description: Brief description of what this spec covers
    status: todo
```

Valid status values: `todo`, `wip`, `done`.

## Step 6: Confirm and Finish

Show the user a brief summary of what you wrote and ask if it captures what they want.
Offer to refine based on their feedback.

Once the user confirms the spec is correct, output `[DONE]` on its own line.
This signals the system that the interview is complete and will end the session.


Assistant: This is a brand-new project with no existing architecture or specs. The provided spec is very detailed — let me ask a few targeted questions to fill in the remaining gaps before writing the spec files.

---

Based on the spec, here are a few things I want to clarify:

**Round 1 — Gaps and ambiguities**

```
1 - The spec shows GET /api/mcp/servers but also mentions POST /api/mcp/connect
    and GET /api/mcp/tools as separate endpoints. Should there be explicit
    connect/disconnect endpoints, or is connection management purely internal
    (auto-connect at startup, lazy for OAuth)?
  a. Auto-connect only — no connect/disconnect endpoints needed
  b. Include POST /api/mcp/connect and DELETE /api/mcp/disconnect for manual control
  c. Other (describe below)

2 - The frontend ServerStatus component — what should it show/do for OAuth servers
    that aren't yet connected?
  a. Show a "Connect" button that opens /api/oauth/start in the browser
  b. Show a status badge only (no action — user navigates manually)
  c. Other (describe below)

3 - For the MCP resource proxy (GET /api/mcp/resource/:serverId), should the proxy
    support all resource types (HTML, JSON, images) or only HTML for iframes?
  a. HTML only — only used for iframe rendering
  b. All mimeTypes — proxy any resource the MCP server returns
  c. Other (describe below)

4 - Token persistence: the spec says in-memory (lost on restart). Is that the
    intended final behaviour, or should the spec note a .tokens.json fallback
    as a stretch goal?
  a. In-memory only — re-auth on restart is acceptable
  b. Persist to .tokens.json (gitignored) from the start
  c. Note .tokens.json as a future/stretch goal but don't implement now
```

User: 1.b, 2.a, 3.a, 4.a

Assistant: Got it. A few more gaps to close:

**Round 2 — UI behaviour and error handling**

```
1 - POST /api/mcp/connect — since servers are declared in config.yaml at startup,
    what does this endpoint do exactly?
  a. Triggers connection for an already-configured (but disconnected) server by ID
  b. Also accepts a full server config in the body (dynamic servers, not in config.yaml)
  c. Other (describe below)

2 - What happens in the chat UI when a streaming tool call fails mid-response?
  a. Show the error inline in the message thread and let the user continue
  b. Show a toast/banner and stop the stream
  c. Other (describe below)

3 - Is there a system prompt the user can configure, or is the LLM called with no
    system message?
  a. No system prompt — bare LLM call
  b. Hardcoded default system prompt (describe what it should say, or leave generic)
  c. User-configurable system prompt via config.yaml
  d. User-editable system prompt in the chat UI (ephemeral)

4 - UI layout preference for the chat interface:
  a. Full-width single column (like ChatGPT)
  b. Sidebar (server list/status) + main chat area
  c. Other (describe below)
```

User: 1.c (honestly I am not sure about this endpoint), 2.a, 3.c, 4.b (PS, I need the implementation of MCP UI or MCP apps sdk to support the fullscreen mode supported by chatgpt - dont forget that)

Assistant: Good answers. One clarification on the connect endpoint, then a few remaining gaps:

**Round 3 — Connect endpoint, system prompt, and fullscreen MCP UI**

```
1 - For POST /api/mcp/connect: since all servers come from config.yaml,
    the most useful thing this endpoint could do is reconnect a server that
    disconnected. Would that cover your needs?
  a. Yes — reconnect a disconnected server by ID (body: { serverId })
  b. Drop it entirely — let auto-connect and OAuth flow handle everything
  c. Other (describe below)

2 - System prompt in config.yaml — what's the format and scope?
  a. Single global system prompt under llm.system_prompt
  b. Per-model system prompts (under each provider config)
  c. Other (describe below)

3 - Fullscreen MCP UI: when an MCP tool returns a UI resource (iframe), the user
    can expand it to fullscreen — like ChatGPT's canvas/sidebar panel. Which model?
  a. Right-side panel that slides in over the chat (like ChatGPT canvas)
  b. True fullscreen overlay (iframe takes the whole viewport)
  c. Both: panel by default, fullscreen toggle inside the panel
  d. Other (describe below)

4 - Should tool call details (name, arguments, raw result) be visible in the chat?
  a. Collapsed by default, expandable on click
  b. Always visible
  c. Hidden — only the final LLM response is shown
```

User: 1.a, 2.b, 3.b, 4.a (if you don't know much about chatgpt-ui, have a look at this page https://developers.openai.com/apps-sdk/build/chatgpt-ui)

Assistant: Good — I now understand the ChatGPT Apps SDK model (Skybridge, `window.openai`, `requestDisplayMode`). One final round:

**Round 4 — ChatGPT Apps SDK compatibility and final gaps**

```
1 - For fullscreen MCP UI, the ChatGPT model uses window.openai.requestDisplayMode()
    called from inside the iframe. Should our client implement a compatible
    window.openai bridge so that MCP apps built for ChatGPT work unmodified?
  a. Yes — implement window.openai.requestDisplayMode (fullscreen) + ui/message
     bridge so ChatGPT-compatible MCP apps work in our client
  b. No — simpler custom protocol is fine, ChatGPT compatibility not needed
  c. Best-effort compatibility: implement requestDisplayMode only, skip the rest

2 - Per-model system prompts in config.yaml — the format:
  a. Under each provider: llm.openai.system_prompt / llm.ollama.system_prompt
  b. Under each model ID: e.g. llm.openai.models.gpt-4o.system_prompt
  c. Other (describe below)

3 - DELETE /api/mcp/disconnect — needed alongside POST /api/mcp/connect?
  a. Yes — include both connect and disconnect endpoints
  b. No — connect only; restart server to fully disconnect

4 - Frontend conversation persistence: chats are currently ephemeral (lost on refresh).
    Is that intentional?
  a. Yes — ephemeral by design, no persistence needed
  b. Persist to localStorage (survives refresh, still no backend)
  c. Other (describe below)
```

User: 1.a, 2.a, 3.a, 4.b