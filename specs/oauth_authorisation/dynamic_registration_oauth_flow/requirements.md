# OAuth Dynamic Registration Flow — Requirements

## Functional Requirements

### OAuth Discovery

- Attempt MCP spec discovery first: inspect the `WWW-Authenticate` header from the MCP server's 401 response or initial connection response
- If MCP spec discovery fails or yields no usable metadata, fall back to RFC 8414: `GET {mcpServerOrigin}/.well-known/oauth-authorization-server`
- Discovery requests must time out after **5 seconds**; a timeout counts as failure and triggers the next fallback
- If both discovery methods fail, abort connection and surface a clear error to the user
- Discovery result must expose at minimum: `authorization_endpoint`, `token_endpoint`; `registration_endpoint` required for dynamic registration

### Dynamic Client Registration (RFC 7591)

- On first connection to an OAuth-protected MCP server, POST to `registration_endpoint` with:
  - `client_name`: a human-readable identifier for this app
  - `redirect_uris`: `["http://localhost:{actualPort}/oauth/callback"]`
  - `token_endpoint_auth_method`: `"none"` (public client)
  - `grant_types`: `["authorization_code", "refresh_token"]`
  - `response_types`: `["code"]`
- Registration request must time out after **5 seconds**
- If registration fails (non-2xx or timeout), abort connection and show an error; no fallback to manual credentials
- Store `client_id` returned by the server in-memory, keyed by `serverId`
- Re-registration occurs on every server restart (no persistence)

### Authorization Flow

- Generate a PKCE pair: `code_verifier` (cryptographically random, ≥ 43 chars, Base64URL-encoded) and `code_challenge` (SHA-256 of verifier, Base64URL-encoded)
- Generate a `state` parameter (cryptographically random, ≥ 16 bytes, Base64URL-encoded) for CSRF protection; use `crypto.randomBytes` — not `Math.random`
- Store `{ serverId, codeVerifier, expiresAt: now + 10 min }` in-memory keyed by `state`
- Construct the authorization URL with: `response_type=code`, `client_id`, `redirect_uri`, `scope` (if required), `state`, `code_challenge`, `code_challenge_method=S256`
- **Manual trigger** (user clicks Connect in UI): open popup directly to the authorization URL
- **Auto-trigger** (401 received from MCP server): emit `{ type: "auth_required", serverId }` as a data stream event in the active chat stream; frontend shows a banner with a "Authorize" button; clicking the button opens the popup
- Popup window opens to the authorization URL
- After user authorizes, the authorization server redirects to `GET /oauth/callback?code=&state=`

### Callback Handling

- `/oauth/callback` validates the `state` parameter against in-memory store; reject with 400 if missing or expired
- Exchange `code` for tokens via POST to `token_endpoint` with: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`
- Store `{ accessToken, refreshToken?, expiresAt? }` in-memory keyed by `serverId`
- Delete the pending state entry from in-memory store
- Render an HTML page that calls `window.opener.postMessage({ type: "oauth_complete", serverId }, "http://localhost:{port}")` and then `window.close()`
- Main app frontend validates `event.origin === "http://localhost:{port}"` before acting on the message

### Token Usage

- Attach `Authorization: Bearer {accessToken}` header to all HTTP requests to the MCP server
- On 401 from MCP server: check if auth is in progress for that server; if so, queue the request; otherwise start a new auth flow
- On token expiry (if `expiresAt` is known and within 60 seconds): proactively refresh before the request
- Refresh: POST to `token_endpoint` with `grant_type=refresh_token`, `refresh_token`, `client_id`
- If refresh fails or no refresh token exists, re-run the full auth flow

### Auth Lock and Request Queue

- `MCPClientManager` maintains one auth lock per `serverId` (`authInProgress: boolean` + `queue: PromiseCallback[]`)
- When auth starts: set lock, all subsequent 401s for the same server append their resume callbacks to the queue
- On auth success: resolve all queued callbacks in order; clear lock
- On popup close without completion (user abandons): reject all queued callbacks immediately with `Error("OAuth cancelled by user")`; clear lock
- The refresh-token path uses the same lock to prevent concurrent refresh races

### Connection Trigger

- Servers declared with `oauth: true` in `config.yaml` do NOT auto-connect at startup; they wait for a manual connect action
- Manual connect: user initiates connection from the MCP server list UI; triggers discovery → registration → auth flow in sequence
- Successful token acquisition marks the server as connected; `MCPClientManager` sets up the transport

---

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Discovery and registration each time out at 5 s. Auth popup completion is user-paced; no server-side timeout on the code exchange wait. |
| Security | PKCE with S256 required for all code exchanges. `state` validated server-side before token exchange. `postMessage` origin validated to `http://localhost:{port}` by the frontend. `client_secret` never issued or stored (public client). |
| Reliability | Queued requests fail immediately (not after a timeout) if the user closes the popup without completing auth. Refresh token races prevented by the per-server auth lock. |
| Observability | INFO log on: flow start (discovery attempt, registration, auth URL open), flow completion (token received), flow failure (discovery failed, registration failed, user cancelled, token exchange failed, refresh failed). No tokens or secrets logged. |
| Scalability | Designed for single-user local use; no concurrency target beyond deduplicating concurrent tool calls to the same server. |
| Maintainability | All OAuth logic lives in `MCPClientManager` (server-side) and `server/routes/oauth.ts` (callback). Frontend is limited to banner UI and postMessage listener. |
