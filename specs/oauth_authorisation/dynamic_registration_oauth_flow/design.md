# OAuth Dynamic Registration Flow — Design

## Data Model

```typescript
// Stored in MCPClientManager, keyed by serverId
interface OAuthClientConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Date.now() ms
}

interface AuthLock {
  inProgress: boolean;
  queue: Array<{ resolve: () => void; reject: (err: Error) => void }>;
}

// Stored in pending state map, keyed by state param value
interface PendingAuthState {
  serverId: string;
  codeVerifier: string;
  expiresAt: number; // Date.now() ms, TTL = 10 min
}
```

**In-memory maps in `MCPClientManager`:**
```
oauthClients:   Map<serverId, OAuthClientConfig>
tokenSets:      Map<serverId, OAuthTokenSet>
authLocks:      Map<serverId, AuthLock>
pendingStates:  Map<state, PendingAuthState>   // could live in oauth route module
```

## Interfaces

### Express Routes

```
GET /oauth/callback
  Query: code (string), state (string)
  Response: HTML page with postMessage + window.close()
  Errors: 400 Bad Request (invalid/expired state), 502 Bad Gateway (token exchange failure)

POST /api/mcp/:serverId/connect
  Body: none
  Response: 200 { status: "connected" } | 202 { status: "auth_required", authUrl: string }
  Triggers manual connect flow (discovery → registration → auth URL generation)
```

### MCPClientManager (key internal methods)

```typescript
// Runs discovery → registration → returns auth URL + stores PKCE/state
async prepareOAuthFlow(serverId: string): Promise<string /* authUrl */>

// Called by /oauth/callback after code exchange; resolves auth lock
async completeOAuthFlow(serverId: string, tokenSet: OAuthTokenSet): Promise<void>

// Called by /oauth/callback on user cancel / error; rejects auth lock queue
async failOAuthFlow(serverId: string, error: Error): Promise<void>

// Wraps MCP HTTP requests; handles 401, lock, queue, token attachment
async callWithAuth<T>(serverId: string, fn: () => Promise<T>): Promise<T>
```

### Vercel AI SDK Data Stream Event (custom)

```typescript
// Emitted as a data part in the chat stream when auto-triggered by 401
{ type: "auth_required", serverId: string }
```

### postMessage Protocol

```typescript
// Sent by /oauth/callback page to window.opener
{ type: "oauth_complete", serverId: string }

// Frontend validates: event.origin === `http://localhost:${port}`
```

## Component Design

### Discovery Sequence

```
MCPClientManager.prepareOAuthFlow(serverId)
  │
  ├─ 1. Attempt MCP spec discovery
  │    GET {mcpServerUrl} → inspect WWW-Authenticate header
  │    Parse resource_metadata or authorization server URL from header
  │    → fetch metadata document
  │
  ├─ 2. If step 1 fails → RFC 8414
  │    GET {mcpServerOrigin}/.well-known/oauth-authorization-server
  │    → parse JSON metadata
  │
  ├─ 3. If both fail → throw OAuthDiscoveryError (surfaced to UI)
  │
  ├─ 4. If oauthClients.has(serverId) → skip registration (already registered this session)
  │
  ├─ 5. POST {registration_endpoint} → receive client_id
  │    Store in oauthClients
  │
  ├─ 6. Generate PKCE (code_verifier, code_challenge S256)
  │    Generate state (random 16 bytes Base64URL)
  │    Store PendingAuthState in pendingStates (TTL 10 min)
  │
  └─ 7. Construct and return authorization URL
```

### Auth Flow (Manual Trigger)

```
UI: user clicks Connect on server X
  → POST /api/mcp/X/connect
  → server calls prepareOAuthFlow(X)
  → returns { status: "auth_required", authUrl }
  → frontend opens popup to authUrl
  → user authorizes → auth server redirects to /oauth/callback?code=&state=
  → /oauth/callback: validate state → exchange code → store token
  → render page: postMessage({ type: "oauth_complete", serverId: X }) to opener
  → frontend validates origin → dismisses connect UI → popup closes
  → MCPClientManager.completeOAuthFlow(X) → resolves auth lock → server connects MCP transport
```

### Auth Flow (Auto-trigger on 401)

```
Chat: LLM invokes tool on server X
  → MCPClientManager.callWithAuth(X, toolCall)
  → MCP HTTP request → 401
  → authLocks.get(X).inProgress? → No
  → set lock, emit data stream event { type: "auth_required", serverId: X }
  → queue this tool call's resume callback
  → frontend receives stream event → shows OAuthBanner component
  → user clicks "Authorize" in banner → frontend calls GET /api/mcp/X/auth/url
     (server calls prepareOAuthFlow if not already started, returns authUrl)
  → frontend opens popup → user authorizes → /oauth/callback completes
  → postMessage to opener → frontend dismisses banner
  → MCPClientManager.completeOAuthFlow(X) → resolves queued tool call
  → tool result flows back to LLM → generation continues
```

### Concurrent 401 Handling

```
Three tool calls A, B, C all get 401 for server X simultaneously:
  A arrives first → sets lock, queues A's resume
  B arrives → lock is set → queues B's resume
  C arrives → lock is set → queues C's resume
  auth completes → resolve [A, B, C] in order → all replay
```

### Token Refresh

```
callWithAuth detects expiresAt within 60 s (or gets a 401 with valid refresh token):
  → check lock → not in progress → set lock
  → POST token_endpoint with refresh_token
  → success: store new tokenSet, resolve lock queue
  → failure: clear refresh token, run full prepareOAuthFlow, open banner
```

### /oauth/callback Route

```typescript
// server/routes/oauth.ts
GET /oauth/callback
  1. Read state from query param
  2. Look up PendingAuthState in pendingStates; reject 400 if missing or expired
  3. POST token_endpoint: grant_type=authorization_code, code, redirect_uri, client_id, code_verifier
  4. On failure: MCPClientManager.failOAuthFlow(serverId, error); return 502
  5. On success: MCPClientManager.completeOAuthFlow(serverId, tokenSet)
  6. Delete pendingStates entry
  7. Render HTML:
     <script>
       window.opener?.postMessage(
         { type: "oauth_complete", serverId: "..." },
         "http://localhost:{port}"
       );
       window.close();
     </script>
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client type | Public (no secret) | Local app cannot protect secrets; PKCE provides equivalent security |
| Token exchange location | Server-side in `/oauth/callback` | Keeps tokens off the frontend; consistent with "tokens never sent to frontend" arch rule |
| Popup vs. redirect | Popup (new window) | Preserves main app state; avoids losing in-flight chat |
| Auto-trigger path | Banner + user click | Browser popup blockers reliably suppress `window.open()` without a user gesture |
| Auth lock | Per-server in MCPClientManager | Single source of truth; avoids distributed lock complexity |
| State storage | In-memory with TTL | Simple; consistent with token storage model; 10-min TTL covers reasonable auth delays |
| Discovery timeout | 5 s per attempt | Prevents connection hang on unresponsive servers; quick fail |
| Registration failure | Hard error | Explicit over silent; user can investigate server capabilities |
| Redirect URI | `http://localhost:{actualListeningPort}/oauth/callback` | Registered at dynamic registration time; uses actual port to survive config changes |
| postMessage origin validation | Strict equality to `http://localhost:{port}` | Prevents token injection from other local pages |
