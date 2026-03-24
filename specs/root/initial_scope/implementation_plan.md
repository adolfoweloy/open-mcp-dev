id: root__initial_scope
overview: >
  Full-stack local MCP chat client. Node.js/Express backend with streaming chat via Vercel AI SDK,
  MCPClientManager for server lifecycle, OAuth2 PKCE flow, HTML resource proxy, and a React 19
  frontend with conversation persistence, model selection, server sidebar, collapsible tool calls,
  and a ChatGPT Apps SDK postMessage bridge inside iframe MCP resources.
status: todo
tasks:

  # ── Project Scaffolding ──────────────────────────────────────────────────

  - task: >
      Create project root files: package.json (workspaces: ["server","client"]), root tsconfig.json
      with path aliases for shared/, and config.example.yaml documenting all supported config fields
      (llm.openai with api_key/default_model/system_prompt, llm.ollama with base_url/system_prompt,
      mcp_servers entries for both stdio and http types including all optional fields). Add .gitignore
      entries for config.yaml, node_modules, and dist.
    refs:
      - specs/root/initial_scope/design.md
      - specs/architecture.md
    status: done

  - task: >
      Test project scaffold: verify package.json workspaces resolve correctly, config.example.yaml
      is valid YAML and contains all documented fields (api_key, base_url, system_prompt,
      mcp_servers with stdio/http variants including oauth, client_id, client_secret, prefer_sse,
      timeout, env).
    refs:
      - specs/root/initial_scope/design.md
    status: done

  # ── Shared Types ─────────────────────────────────────────────────────────

  - task: >
      Create shared/types.ts exporting: ModelInfo { provider: "openai"|"ollama"; id: string;
      label: string }, ModelSelection { provider: "openai"|"ollama"; id: string },
      McpServerStatus { id: string; connected: boolean; requiresOAuth: boolean },
      ChatRequest { messages: UIMessage[]; model: ModelSelection; selectedServers: string[] }.
      All types must be importable from both server and client.
    refs:
      - specs/root/initial_scope/design.md
    status: done

  - task: >
      Test shared types: compile shared/types.ts with tsc and assert no errors; verify
      all exported names are present; check that ChatRequest.messages is typed as UIMessage[]
      from the Vercel AI SDK.
    refs:
      - specs/root/initial_scope/design.md
    status: done

  # ── Server: Config ───────────────────────────────────────────────────────

  - task: >
      Create server/config.ts that reads and validates config.yaml using js-yaml. Export:
      - Config interface matching the design.md schema (llm.openai?, llm.ollama?,
        mcp_servers: Record<string, McpServerConfig>)
      - McpServerConfig discriminated union (stdio: command/args/env/timeout, http: url/oauth/
        client_id/client_secret/access_token/refresh_token/prefer_sse/timeout)
      - loadConfig(): Config — throws with a descriptive message if the file is missing or
        invalid YAML; does not throw if optional fields are absent.
      - getSystemPrompt(model: ModelSelection, config: Config): string | undefined
    refs:
      - specs/root/initial_scope/design.md
      - specs/root/initial_scope/requirements.md
    status: done

  - task: >
      Test server/config.ts: valid config with all fields loads correctly; config missing
      optional llm.openai/llm.ollama/system_prompt fields still loads; missing config.yaml
      throws a descriptive error; invalid YAML throws; getSystemPrompt returns correct
      prompt per provider and undefined when not set.
    refs:
      - specs/root/initial_scope/requirements.md
    status: done

  # ── Server: MCP Client Manager ───────────────────────────────────────────

  - task: >
      Create server/lib/mcp-manager.ts implementing MCPClientManager class:
      - Internal Map<serverId, Client> for connected MCP clients
      - connectToServer(id: string, serverConfig: McpServerConfig, accessToken?: string): Promise<void>
        — for http servers tries StreamableHTTPClientTransport first, falls back to SSEClientTransport
        on failure; for stdio uses StdioClientTransport; deduplicates in-flight connects via a
        pending Map; throws on final failure.
      - disconnectServer(id: string): Promise<void> — closes and removes from map.
      - isConnected(id: string): boolean
      - requiresOAuth(id: string, configs: Record<string, McpServerConfig>): boolean
      - getServerStatuses(configs: Record<string, McpServerConfig>): McpServerStatus[]
      - getToolsForAiSdk(serverIds?: string[]): Promise<ToolSet> — returns Vercel AI SDK ToolSet
        with keys namespaced as {serverId}__{toolName}; normalises tool input schemas to ensure
        top-level `type: "object"` for Anthropic compatibility; if serverIds is omitted uses all
        connected servers.
    refs:
      - specs/root/initial_scope/design.md
      - specs/root/initial_scope/requirements.md
      - specs/architecture.md
    status: done

  - task: >
      Test MCPClientManager: mock MCP server; connectToServer succeeds for stdio and http variants;
      duplicate concurrent connect calls deduplicate (only one connection initiated); disconnectServer
      removes from map; getServerStatuses returns correct connected/requiresOAuth flags;
      getToolsForAiSdk returns tools with {serverId}__{toolName} namespacing; schemas without
      top-level type:object are normalised; selecting specific serverIds filters correctly.
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: done

  # ── Server: Model Helpers ─────────────────────────────────────────────────

  - task: >
      Create server/lib/models.ts exporting createModel(selection: ModelSelection, config: Config).
      For provider="openai": returns createOpenAI({ apiKey: config.llm.openai.api_key })(selection.id).
      For provider="ollama": returns createOllama({ baseURL: config.llm.ollama?.base_url ?? "http://localhost:11434/api" })(selection.id).
      Throws a descriptive error if the requested provider is not configured.
    refs:
      - specs/root/initial_scope/design.md
      - specs/root/initial_scope/requirements.md
    status: done

  - task: >
      Create server/lib/ollama.ts exporting listOllamaModels(baseUrl: string): Promise<ModelInfo[]>.
      GETs {baseUrl}/api/tags, maps each entry to ModelInfo { provider: "ollama", id: name, label: name }.
      On network error returns [] and logs a warning. Timeout after 5 s.
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: done

  - task: >
      Test model helpers: createModel with openai provider returns model; createModel with ollama
      provider returns model; createModel with unconfigured provider throws. listOllamaModels
      parses /api/tags response correctly; listOllamaModels returns [] on network error without
      throwing; listOllamaModels times out gracefully.
    refs:
      - specs/root/initial_scope/requirements.md
    status: done

  # ── Server: Chat Route ───────────────────────────────────────────────────

  - task: >
      Create server/routes/chat.ts (Express Router). POST /api/chat:
      - Parses body { messages: UIMessage[], model: ModelSelection, selectedServers: string[] }
      - Calls getSystemPrompt(model, config) and includes as system message if present
      - Calls createModel(model, config) and mcpManager.getToolsForAiSdk(selectedServers)
      - Calls streamText({ model, system, messages: await convertToModelMessages(messages),
        tools, stopWhen: stepCountIs(20), onError: (err) => console.error("[chat]", err) })
      - Sets headers: Content-Type: text/plain; charset=utf-8, X-Vercel-AI-Data-Stream: v1
      - Pipes response via result.pipeUIMessageStreamToResponse(res)
      - On 401 from tool call: attempts token refresh then retries; surfaces error inline if
        refresh fails.
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
      - specs/architecture.md
    status: done

  - task: >
      Test chat route: POST /api/chat with valid body streams a response with correct headers
      (Content-Type text/plain, X-Vercel-AI-Data-Stream v1); system prompt from config is
      passed to streamText; selectedServers filters tools; streaming errors are surfaced inline
      and stream terminates gracefully; missing model config returns 500 with error message.
    refs:
      - specs/root/initial_scope/requirements.md
    status: done

  # ── Server: Models Route ─────────────────────────────────────────────────

  - task: >
      Create server/routes/models.ts (Express Router). GET /api/models:
      - If config.llm.openai present: includes hardcoded list of common OpenAI model IDs
        (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo) as ModelInfo[]
      - If config.llm.ollama present: fetches models via listOllamaModels(base_url)
      - Returns JSON array of all ModelInfo sorted with OpenAI first, then Ollama
      - Always returns 200 with an array (may be empty if nothing is configured)
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: done

  - task: >
      Test models route: returns OpenAI models when only openai is configured; returns Ollama
      models dynamically fetched when only ollama configured; returns both providers combined
      when both configured; returns empty array when neither configured; Ollama fetch failure
      returns available models without crashing.
    refs:
      - specs/root/initial_scope/requirements.md
    status: done

  # ── Server: MCP Server Management Routes ─────────────────────────────────

  - task: >
      Create server/routes/mcp.ts (Express Router):
      - GET /api/mcp/servers — returns JSON array of McpServerStatus from mcpManager.getServerStatuses()
      - POST /api/mcp/connect — body { serverId: string }; calls mcpManager.connectToServer()
        for the named server; returns 200 on success, 404 if serverId not in config, 500 on
        connection error with error message
      - DELETE /api/mcp/disconnect — body { serverId: string }; calls mcpManager.disconnectServer();
        returns 200 on success, 404 if not found
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test MCP management routes: GET /api/mcp/servers returns correct statuses; POST connect
      succeeds for known server and returns 404 for unknown; DELETE disconnect removes connected
      server and returns 404 for unknown; connection error during POST returns 500 with message.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Server: MCP Resource Proxy ────────────────────────────────────────────

  - task: >
      Create server/routes/mcp-proxy.ts (Express Router). GET /api/mcp/resource/:serverId:
      - Query param uri (URL-encoded MCP resource URI) is required; return 400 if missing
      - Looks up connected MCP client for serverId; returns 404 if not connected
      - Calls client.readResource({ uri }) using stored OAuth access token in Authorization header
        if available
      - If response mimeType is not text/html (or text/html with charset): return 415
      - Streams HTML content back to client with Content-Type: text/html; charset=utf-8
      - On error (including 401): returns appropriate HTTP status code
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
      - specs/architecture.md
    status: todo

  - task: >
      Test MCP proxy: valid HTML resource proxied with correct Content-Type; missing uri param
      returns 400; unknown serverId returns 404; non-HTML resource returns 415; 401 from MCP
      server returns 401 to client.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Server: OAuth Route ───────────────────────────────────────────────────

  - task: >
      Create server/routes/oauth.ts (Express Router) implementing OAuth2 Authorization Code + PKCE:
      - Module-level Maps: pendingSessions: Map<state, { serverId, codeVerifier, clientInfo }>
        and oauthTokens: Map<serverId, OAuthTokens> (exported for use in mcp-manager and chat)
      - GET /api/oauth/start?server=<id>:
          1. Looks up serverId in config; returns 400 if not found or not oauth:true
          2. Calls discoverOAuthProtectedResourceMetadata then discoverOAuthMetadata
          3. If pre-configured client_id present: skips registerClient; otherwise calls registerClient
          4. Calls startAuthorization({ codeVerifier, ... }) to get PKCE params and auth URL
          5. Stores state → { serverId, codeVerifier, clientInfo } in pendingSessions
          6. Redirects browser to authorization URL
      - GET /api/oauth/callback?code=&state=:
          1. Looks up state in pendingSessions; returns 400 if not found
          2. Calls exchangeAuthorization(code, codeVerifier) to get tokens
          3. Stores tokens in oauthTokens Map keyed by serverId
          4. Removes pendingSessions entry
          5. Calls mcpManager.connectToServer(serverId, config, accessToken)
          6. Redirects to /
      - Export getOAuthToken(serverId: string): OAuthTokens | undefined for use by proxy/chat
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test OAuth routes: /api/oauth/start with valid oauth server redirects to auth URL; unknown
      server returns 400; non-oauth server returns 400; /api/oauth/callback with valid state
      exchanges code and stores token; invalid state returns 400; after callback MCP server is
      connected and token is accessible via getOAuthToken.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Server: Entry Point ───────────────────────────────────────────────────

  - task: >
      Create server/index.ts implementing the startup sequence:
      1. loadConfig() — exit process with error if config.yaml invalid
      2. Instantiate MCPClientManager (singleton, exported for use in routes)
      3. For each entry in config.mcp_servers: if http && oauth:true skip; otherwise call
         mcpManager.connectToServer(id, serverConfig).catch(err => console.warn("[startup]", err))
      4. Mount express.json() middleware
      5. Mount route handlers at /api/chat, /api/models, /api/mcp, /api/oauth
      6. In production (NODE_ENV=production): serve client/dist as static files with fallback
         to index.html for client-side routing
      7. In dev: just mount the API routes; Vite dev server handles frontend and proxies /api
      8. Listen on PORT env var or default 3000; log listening message
    refs:
      - specs/root/initial_scope/design.md
      - specs/root/initial_scope/requirements.md
      - specs/architecture.md
    status: todo

  - task: >
      Test server startup: server starts without config.yaml present and logs error + exits;
      server starts with valid config and auto-connects non-oauth servers; OAuth servers are
      skipped at startup; connection failures during startup are logged as warnings and server
      still starts; all API routes are mounted and respond.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: Build Config ──────────────────────────────────────────────────

  - task: >
      Create client/package.json with dev dependencies (vite, @vitejs/plugin-react, typescript,
      tailwindcss) and runtime dependencies (@ai-sdk/react, ai, react, react-dom).
      Create client/vite.config.ts:
      - Plugin: @vitejs/plugin-react
      - In dev: proxy /api/* → http://localhost:3000 (backend Express server)
      - Build output: dist/
      Create client/index.html referencing client/src/main.tsx.
      Create client/tsconfig.json with jsx: react-jsx, strict: true, path alias for shared/.
    refs:
      - specs/root/initial_scope/design.md
      - specs/architecture.md
    status: todo

  - task: >
      Test client build config: vite build succeeds without errors; proxy config correctly
      forwards /api/* to port 3000 in dev mode; TypeScript compilation has no errors;
      tailwind CSS classes are included in output.
    refs:
      - specs/architecture.md
    status: todo

  # ── Client: Lib — Types, Storage, API ────────────────────────────────────

  - task: >
      Create client/src/lib/types.ts re-exporting shared types plus any client-only types:
      Conversation { id: string; title: string; messages: UIMessage[] }.
      Create client/src/lib/storage.ts with:
      - STORAGE_KEYS = { conversations: "mcp-chat:conversations", activeId: "mcp-chat:active-conversation" }
      - loadConversations(): Conversation[] — parses localStorage, returns [] on parse error
      - saveConversations(convs: Conversation[]): void — prunes to max 50 by recency before saving
      - loadActiveId(): string | null
      - saveActiveId(id: string | null): void
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test storage helpers: loadConversations returns [] when localStorage is empty; saves and
      reloads conversations correctly; prunes to 50 when limit exceeded (removes oldest);
      invalid JSON in localStorage returns [] without throwing; saveActiveId/loadActiveId
      roundtrip correctly; null activeId clears the key.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  - task: >
      Create client/src/lib/api.ts with typed fetch helpers:
      - fetchModels(): Promise<ModelInfo[]> — GET /api/models
      - fetchServers(): Promise<McpServerStatus[]> — GET /api/mcp/servers
      - connectServer(serverId: string): Promise<void> — POST /api/mcp/connect
      - disconnectServer(serverId: string): Promise<void> — DELETE /api/mcp/disconnect
      All helpers throw on non-2xx responses with a message containing status and body text.
    refs:
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test API helpers: each helper sends correct method/path/body; non-2xx response causes
      throw with status info; successful response parses JSON correctly; connectServer and
      disconnectServer send correct JSON body.
    refs:
      - specs/root/initial_scope/design.md
    status: todo

  # ── Client: ModelSelector ─────────────────────────────────────────────────

  - task: >
      Create client/src/components/ModelSelector.tsx:
      - On mount fetches models via fetchModels(); on error logs and shows empty select
      - Renders <select> with options grouped by provider (OpenAI / Ollama)
      - Default selected value is the first model in the list
      - Props: onSelect(model: ModelSelection) called on change; value: ModelSelection | null
      - Model selection is ephemeral (controlled by parent via props); resets to first model
        when models list changes
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test ModelSelector: renders options from fetched model list; default selects first model
      and calls onSelect on mount; onSelect called with correct ModelSelection on change;
      fetch error renders empty select without crashing; groups options by provider label.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: ServerSidebar ─────────────────────────────────────────────────

  - task: >
      Create client/src/components/ServerSidebar.tsx:
      - Fetches server list on mount via fetchServers(); polls every 5 s
      - Renders each server as a row: name, green/red connected indicator
      - For requiresOAuth && !connected servers: renders "Connect" button that opens
        /api/oauth/start?server=<id> in a new browser tab/window
      - For non-oauth disconnected servers: renders "Reconnect" button that calls connectServer()
      - For connected servers: renders "Disconnect" button that calls disconnectServer()
      - Props: selectedServers: string[]; onToggle(serverId: string): void — parent controls
        which servers are included in chat requests
      - Each server row has a checkbox or toggle for selection; checked state driven by selectedServers prop
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test ServerSidebar: renders server list from API; OAuth server shows Connect button
      linking to /api/oauth/start; non-oauth disconnected server shows Reconnect button;
      connected server shows Disconnect button; toggle calls onToggle with correct serverId;
      poll interval re-fetches server list; fetch error renders gracefully.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: ToolCallResult ────────────────────────────────────────────────

  - task: >
      Create client/src/components/ToolCallResult.tsx:
      - Props: toolName: string; args: unknown; result: unknown; isError?: boolean
      - Renders a collapsible section collapsed by default
      - Header shows tool name (formatted from namespaced key {serverId}__{toolName})
        and a toggle arrow
      - Expanded: shows "Arguments" section with JSON-formatted args, and "Result" section
        with JSON-formatted result
      - isError=true applies error styling to the result section
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test ToolCallResult: renders collapsed by default showing tool name; clicking header
      expands to show args and result JSON; clicking again collapses; isError styling applied
      when isError=true; namespaced tool name displayed correctly.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: McpResourceFrame ──────────────────────────────────────────────

  - task: >
      Create client/src/components/McpResourceFrame.tsx:
      - Props: serverId: string; uri: string; onSendMessage(content: string): void;
        onUpdateContext(content: string): void
      - Renders <iframe src={`/api/mcp/resource/${serverId}?uri=${encodeURIComponent(uri)}`}
        sandbox="allow-scripts allow-forms allow-same-origin" />
      - On iframe load: sends ui/ready bootstrap postMessage to iframe:
        { jsonrpc: "2.0", method: "ui/ready", params: { version: "1.0" } }
      - Listens for postMessage events from iframe and handles:
          * requestDisplayMode { mode: "fullscreen" }: mounts full-viewport overlay div
          * requestDisplayMode { mode: "inline" | "picture-in-picture" }: collapses overlay
          * ui/message: calls onSendMessage with text content from params
          * tools/call: calls POST /api/chat as a single-tool invocation, then sends
            ui/notifications/tool-result back to iframe
          * ui/update-model-context: calls onUpdateContext with text content
      - Fullscreen overlay: fixed position, full viewport, z-index above everything,
        with a close/exit button that also sends requestDisplayMode inline back to iframe
      - Renders a fullscreen toggle button on the iframe container for manual trigger
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
      - specs/architecture.md
    status: todo

  - task: >
      Test McpResourceFrame: iframe src set correctly with encoded URI; ui/ready sent on
      iframe load; requestDisplayMode fullscreen mounts overlay; requestDisplayMode inline
      collapses overlay; ui/message calls onSendMessage; tools/call sends request and returns
      tool-result notification to iframe; ui/update-model-context calls onUpdateContext;
      sandbox attribute set correctly; manual fullscreen button works.
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  # ── Client: MessageBubble & MessageList ──────────────────────────────────

  - task: >
      Create client/src/components/MessageBubble.tsx:
      - Props: message: UIMessage
      - Renders user messages right-aligned, assistant messages left-aligned
      - For each part in message.parts:
          * type "text": renders text content (supporting markdown via a library or plain <pre>)
          * type "tool-invocation": renders <ToolCallResult> with toolName, args, result; collapsed by default
          * type "tool-result" with resource content (mimeType text/html or data:text/html payload
            or mcp:// URI): renders <McpResourceFrame>; otherwise renders JSON result
          * streaming in-progress indicator when message has no parts yet
      - Error messages styled distinctively
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test MessageBubble: user message right-aligned; assistant message left-aligned; text
      part renders text; tool-invocation renders ToolCallResult collapsed; HTML resource
      tool-result renders McpResourceFrame; non-HTML result renders JSON; empty parts shows
      loading indicator; error message styled with error class.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  - task: >
      Create client/src/components/MessageList.tsx:
      - Props: messages: UIMessage[]
      - Renders a scrollable list of <MessageBubble> components
      - Auto-scrolls to the bottom on new messages
      - Shows a "No messages yet" empty state when list is empty
    refs:
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test MessageList: renders correct number of MessageBubble children; empty state shown
      when messages=[]; auto-scroll ref is attached to bottom sentinel; new messages trigger
      scroll to bottom.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: Chat ──────────────────────────────────────────────────────────

  - task: >
      Create client/src/components/Chat.tsx:
      - Uses useChat() from @ai-sdk/react with api="/api/chat" and body including
        model: ModelSelection and selectedServers: string[]
      - Props: conversation: Conversation | null; model: ModelSelection; selectedServers: string[];
        onMessagesChange(messages: UIMessage[]): void
      - Syncs messages to parent via onMessagesChange on every change for localStorage persistence
      - Renders <MessageList messages={messages} />, a textarea input, and a Send button
      - Textarea: Enter sends (Shift+Enter for newline); disabled while isLoading
      - Streaming errors displayed inline in the message thread as an error bubble
      - Supports injecting a follow-up message externally via an imperative append() or by
        exposing a ref/callback for McpResourceFrame ui/message integration
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test Chat: submitting message calls POST /api/chat; messages streamed to UI; Enter
      key submits, Shift+Enter inserts newline; input disabled while loading; streaming error
      shown inline; onMessagesChange called on each update; model and selectedServers included
      in request body.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  # ── Client: App & Conversation Management ────────────────────────────────

  - task: >
      Create client/src/App.tsx implementing the top-level layout and conversation management:
      - State: conversations (loaded from localStorage), activeConversationId, selectedModel,
        selectedServers
      - Left panel: conversation list (new conversation button, list of past conversations with
        title; clicking switches active conversation); <ServerSidebar> below conversation list
      - Main area: <ModelSelector> at top; <Chat> for the active conversation; if no conversation
        selected shows a "Start a new chat" prompt
      - New conversation: creates Conversation { id: crypto.randomUUID(), title: "New Chat",
        messages: [] }, prepends to list, saves to localStorage
      - On each messages change: updates conversation title to the text of the first user message
        (truncated to 60 chars) and persists to localStorage
      - Conversation pruning: max 50 conversations; oldest removed when limit exceeded
      - selectedServers toggled via <ServerSidebar onToggle>; all servers selected by default
        (once server list is loaded)
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test App: loads conversations from localStorage on mount; new conversation created and
      saved; switching conversations restores correct messages; conversation title updated from
      first user message; max 50 conversations enforced; selectedServers passed down to Chat;
      model selection passed to Chat.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo

  - task: >
      Create client/src/main.tsx bootstrapping React 19 app:
      - StrictMode wrapper
      - Mounts <App /> into #root
      Create client/index.html with charset utf-8, viewport meta, title "MCP Chat", and
      <div id="root"> + script tag for main.tsx.
    refs:
      - specs/root/initial_scope/design.md
    status: todo

  - task: >
      Test main entry: React app mounts into #root without errors; StrictMode is applied;
      index.html contains correct meta tags and script reference.
    refs:
      - specs/root/initial_scope/design.md
    status: todo

  # ── Non-Functional / Cross-Cutting ────────────────────────────────────────

  - task: >
      Verify security requirements end-to-end: OpenAI API key is never included in any
      frontend bundle or API response; OAuth tokens are never sent to the client; MCP resource
      proxy keeps Authorization header server-side; iframe has correct sandbox attribute
      (allow-scripts allow-forms allow-same-origin). Review server routes for injection risks.
    refs:
      - specs/root/initial_scope/requirements.md
      - specs/architecture.md
    status: todo

  - task: >
      Verify observability requirements: server logs MCP connection events (connect/disconnect/
      failure) and tool call errors to stdout; no external telemetry or logging service calls;
      startup failures (config missing) exit with a clear error message.
    refs:
      - specs/root/initial_scope/requirements.md
    status: todo
