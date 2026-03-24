id: oauth_authorisation__dynamic_registration_oauth_flow
overview: >
  Implement RFC 7591 dynamic client registration + OAuth2 Authorization Code + PKCE for HTTP MCP
  servers. Adds auth lock + callWithAuth to MCPClientManager; refactors /oauth/callback to return
  HTML postMessage response; adds POST /api/mcp/:serverId/connect and GET /api/mcp/:serverId/auth/url
  routes; wires auth_required data stream event into the chat route; and adds OAuthBanner +
  postMessage listener on the frontend.
status: todo
tasks:
  - task: >
      Add OAuth data structures and in-memory maps to MCPClientManager in
      server/lib/mcp-manager.ts. Define TypeScript interfaces: OAuthClientConfig { clientId:
      string; authorizationEndpoint: string; tokenEndpoint: string }, OAuthTokenSet { accessToken:
      string; refreshToken?: string; expiresAt?: number (Date.now() ms) }, AuthLock { inProgress:
      boolean; queue: Array<{ resolve: () => void; reject: (err: Error) => void }> },
      PendingAuthState { serverId: string; codeVerifier: string; expiresAt: number (TTL=10min) }.
      Add private maps: oauthClients: Map<serverId, OAuthClientConfig>, tokenSets: Map<serverId,
      OAuthTokenSet>, authLocks: Map<serverId, AuthLock>, pendingStates: Map<state,
      PendingAuthState>. All maps initialized empty in the constructor. Export the interfaces for
      use by the OAuth route module.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: done

  - task: >
      Test MCPClientManager OAuth data structures: all four maps (oauthClients, tokenSets,
      authLocks, pendingStates) are initialized as empty Maps on construction; interface types
      match expected shape via TypeScript compilation.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: done

  - task: >
      Implement MCPClientManager.prepareOAuthFlow(serverId: string, serverUrl: string, port:
      number): Promise<string> in server/lib/mcp-manager.ts. Sequence: (1) MCP spec discovery —
      GET serverUrl, inspect WWW-Authenticate header for resource_metadata or authorization server
      URL, then fetch metadata document; 5-second timeout per request. (2) If step 1 fails, RFC
      8414 fallback — GET {origin}/.well-known/oauth-authorization-server; 5-second timeout. (3)
      If both fail, throw OAuthDiscoveryError with a message surfaceable to the user. (4) If
      oauthClients already has this serverId, skip registration. (5) POST registration_endpoint
      with: client_name="MCP Chat", redirect_uris=["http://localhost:{port}/oauth/callback"],
      token_endpoint_auth_method="none", grant_types=["authorization_code","refresh_token"],
      response_types=["code"]; 5-second timeout; non-2xx or timeout throws OAuthRegistrationError.
      Store returned client_id + endpoints in oauthClients. (6) Generate PKCE: code_verifier
      (crypto.randomBytes(32) Base64URL-encoded, ≥43 chars), code_challenge (SHA-256 of verifier
      Base64URL-encoded). (7) Generate state: crypto.randomBytes(16) Base64URL-encoded. (8) Store
      PendingAuthState in pendingStates keyed by state, with expiresAt = Date.now() + 600_000.
      (9) Construct and return authorization URL with: response_type=code, client_id, redirect_uri,
      scope (if provided by metadata), state, code_challenge, code_challenge_method=S256.
      Log INFO for: discovery attempt start, registration attempt, auth URL construction.
      Never log tokens or client secrets.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: done

  - task: >
      Test MCPClientManager.prepareOAuthFlow: (a) happy path — mock discovery (MCP spec) succeeds,
      registration returns client_id, returns a valid authorization URL containing client_id,
      code_challenge, state, redirect_uri; (b) MCP discovery fails → RFC 8414 fallback used; (c)
      both discovery methods fail → throws OAuthDiscoveryError; (d) registration non-2xx → throws
      OAuthRegistrationError; (e) second call for same serverId skips registration (oauthClients
      already populated); (f) discovery request times out after 5 s (mock with delayed response);
      (g) registration request times out after 5 s; (h) pendingStates entry has expiresAt ≈ 10 min
      from now; (i) code_verifier is ≥43 chars and Base64URL-encoded; (j) state is 16-byte
      Base64URL.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: done

  - task: >
      Implement MCPClientManager.completeOAuthFlow(serverId: string, tokenSet: OAuthTokenSet):
      Promise<void> and MCPClientManager.failOAuthFlow(serverId: string, error: Error):
      Promise<void> in server/lib/mcp-manager.ts. completeOAuthFlow: stores tokenSet in tokenSets
      map; calls connectToServer with the accessToken to establish the MCP transport; retrieves
      the AuthLock for serverId, resolves all queued callbacks in order ({ resolve, reject } pairs
      → call resolve()); clears inProgress flag and empties the queue. failOAuthFlow: retrieves
      AuthLock, rejects all queued callbacks immediately with the provided error; clears inProgress
      and empties the queue. Both methods are no-ops if no AuthLock entry exists for the serverId.
      Log INFO on flow completion (token received) and flow failure (user cancelled, exchange
      failed). Never log tokens.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: done

  - task: >
      Test completeOAuthFlow and failOAuthFlow: (a) completeOAuthFlow resolves N queued promise
      callbacks in order; (b) completeOAuthFlow stores token in tokenSets map; (c)
      completeOAuthFlow calls connectToServer with the accessToken; (d) completeOAuthFlow clears
      authLock (inProgress=false, queue empty); (e) failOAuthFlow rejects all queued callbacks
      with the provided error; (f) failOAuthFlow clears authLock; (g) both are no-ops when no
      lock entry exists (no throw).
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: done

  - task: >
      Implement MCPClientManager.callWithAuth<T>(serverId: string, fn: () => Promise<T>,
      emitEvent?: (event: object) => void): Promise<T> in server/lib/mcp-manager.ts. Behavior:
      (1) Proactive refresh — if tokenSets has entry for serverId and expiresAt is within 60 s:
      acquire auth lock; POST token_endpoint with grant_type=refresh_token, refresh_token,
      client_id; on success store new tokenSet and release lock; on failure (or no refresh token)
      clear refreshToken from tokenSets and fall through to full re-auth. (2) Attach
      Authorization: Bearer {accessToken} header — call fn() with the token injected. The fn()
      callback is responsible for including the token in the HTTP request. (3) On 401 response
      from fn(): check authLocks for serverId; if inProgress=true, queue a new Promise (push
      { resolve, reject } to lock.queue) and await it, then retry fn(); if inProgress=false, set
      inProgress=true, call emitEvent?.({ type: "auth_required", serverId }), push this call's
      resume callback to queue, and await resolution. (4) On popup-closed signal (failOAuthFlow
      called): the queued Promise rejects with Error("OAuth cancelled by user") — propagate. Log
      INFO on: auth_required emitted, 401 queued, token refresh start, refresh success, refresh
      failure. Never log tokens.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: done

  - task: >
      Test callWithAuth: (a) attaches Bearer token to fn() call when token exists; (b) first 401
      sets inProgress=true and calls emitEvent with { type: "auth_required", serverId }; (c) after
      completeOAuthFlow resolves the lock, the original fn() is retried and returns successfully;
      (d) concurrent 401s for the same serverId all queue behind a single lock — only one
      auth_required event emitted; (e) failOAuthFlow causes all queued callers to reject with
      "OAuth cancelled by user"; (f) proactive refresh fires when expiresAt is within 60 s and
      refreshToken exists; (g) successful refresh stores new tokenSet and does not emit
      auth_required; (h) refresh failure (non-2xx) falls back to emitting auth_required; (i) no
      refresh token → skips refresh, emits auth_required.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: done

  - task: >
      Refactor GET /oauth/callback in server/routes/oauth.ts to return an HTML page instead of
      redirecting to "/". Changes: (1) Add expiresAt check to pending session lookup — if
      session.expiresAt < Date.now(), delete the entry and return 400 { error: "OAuth state
      expired" }. (2) If state is missing or not found in pendingSessions, return 400 { error:
      "Invalid or missing OAuth state" }. (3) If code is missing, return 400 { error: "Missing
      authorization code" }. (4) Exchange code via POST to token_endpoint (existing
      exchangeAuthorization logic). On exchange failure: call
      mcpManager.failOAuthFlow(serverId, error), delete pendingSessions entry, return 502. (5) On
      success: call mcpManager.completeOAuthFlow(serverId, tokenSet) (which stores token +
      connects transport + resolves lock queue). Delete pendingSessions entry. Render HTML response
      with Content-Type text/html:
        <script>
          window.opener?.postMessage(
            { type: "oauth_complete", serverId: "{serverId}" },
            "http://localhost:{port}"
          );
          window.close();
        </script>
      The port is obtained from the Express server's actual listening address (passed via config or
      constructor injection). Log INFO on: callback received, token exchange success/failure.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test refactored GET /oauth/callback: (a) missing state → 400; (b) unknown state → 400; (c)
      expired state (expiresAt in the past) → 400 with "expired" message; (d) missing code → 400;
      (e) successful exchange → response is HTML containing postMessage call with correct serverId
      and closes window; (f) token exchange failure → calls failOAuthFlow, returns 502; (g)
      successful exchange → calls completeOAuthFlow with tokenSet; (h) pendingSessions entry
      deleted after callback (both success and failure paths).
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Add POST /api/mcp/:serverId/connect route to server/routes/mcp.ts (or a new
      server/routes/oauth-connect.ts if separation is preferred). Behavior: (1) serverId from URL
      param; return 404 if not in config. (2) If already connected (mcpManager.isConnected):
      return 200 { status: "connected" }. (3) If not an OAuth server: call
      mcpManager.connectToServer normally; return 200 { status: "connected" } on success, 500 on
      failure. (4) If OAuth server (config.oauth===true): call
      mcpManager.prepareOAuthFlow(serverId, serverUrl, port); return 202 { status:
      "auth_required", authUrl: string }. On prepareOAuthFlow failure (discovery/registration
      error): return 500 { error: message }. The Express server's actual listening port is needed
      to construct the redirect_uri — pass it to prepareOAuthFlow (or derive from req).
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Test POST /api/mcp/:serverId/connect: (a) unknown serverId → 404; (b) already connected
      → 200 { status: "connected" }, no reconnect attempt; (c) non-OAuth server → calls
      connectToServer, returns 200 { status: "connected" }; (d) non-OAuth connect failure → 500;
      (e) OAuth server not yet connected → calls prepareOAuthFlow, returns 202 { status:
      "auth_required", authUrl }; (f) OAuth server, prepareOAuthFlow fails (discovery error)
      → 500 with error message.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Add GET /api/mcp/:serverId/auth/url route to server/routes/mcp.ts (or oauth-connect.ts).
      Purpose: called by the frontend OAuthBanner when the user clicks "Authorize" during an
      auto-triggered flow. Behavior: (1) serverId from URL param; return 404 if not in config or
      not an OAuth server. (2) Call mcpManager.prepareOAuthFlow(serverId, serverUrl, port) and
      return 200 { authUrl: string }. If prepareOAuthFlow throws, return 500 { error: message }.
      Note: prepareOAuthFlow is idempotent for re-registration (skips if already registered this
      session) and will create a fresh PKCE/state pair each time called.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test GET /api/mcp/:serverId/auth/url: (a) unknown serverId → 404; (b) non-OAuth server
      → 404 or 400; (c) valid OAuth server → calls prepareOAuthFlow and returns 200 { authUrl };
      (d) prepareOAuthFlow failure → 500 with error message.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Wire callWithAuth into tool execution and emit auth_required data stream events in the
      chat route (server/routes/chat.ts). Changes: (1) Modify MCPClientManager.getToolsForAiSdk
      to accept an optional emitEvent: (event: object) => void parameter; pass it to
      callWithAuth calls within each tool's execute function — each tool's execute becomes:
      mcpManager.callWithAuth(serverId, () => client.callTool(...), emitEvent). (2) In the chat
      route, use pipeDataStreamToResponse with a dataStreamWriter callback (or equivalent Vercel
      AI SDK v6 API) to obtain a writer; create an emitEvent function that calls
      writer.writeData({ type: "auth_required", serverId }). Pass emitEvent to
      getToolsForAiSdk. The auth_required event is emitted mid-stream so the frontend can show
      the OAuthBanner while the tool call is queued server-side waiting for auth completion.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
      - specs/architecture.md
    status: todo

  - task: >
      Test auth_required event in chat route: (a) when a tool call triggers callWithAuth which
      emits { type: "auth_required", serverId }, verify the data stream contains the event as a
      data part; (b) after completeOAuthFlow resolves the lock, the tool result flows through
      normally; (c) emitEvent is not called for non-OAuth tool calls.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Add startOAuthConnect(serverId: string): Promise<{ status: string; authUrl?: string }> to
      client/src/lib/api.ts. Calls POST /api/mcp/{serverId}/connect; returns the JSON response.
      On non-2xx, throws an error with the response body. Also add
      fetchOAuthAuthUrl(serverId: string): Promise<{ authUrl: string }> which calls GET
      /api/mcp/{serverId}/auth/url.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test startOAuthConnect and fetchOAuthAuthUrl in client/src/lib/api.test.ts: (a)
      startOAuthConnect calls POST /api/mcp/{serverId}/connect with correct path; (b) returns
      { status: "auth_required", authUrl } on 202; (c) throws on non-2xx; (d)
      fetchOAuthAuthUrl calls GET /api/mcp/{serverId}/auth/url; (e) returns { authUrl } on 200.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Create client/src/components/OAuthBanner.tsx. Props: serverId: string, onDismiss: () =>
      void. Behavior: (1) Renders a dismissible banner: "Authorization required for server
      {serverId}" with an "Authorize" button and an "×" dismiss button. (2) On "Authorize" click:
      calls fetchOAuthAuthUrl(serverId) to get authUrl; opens window.open(authUrl, "_blank",
      "width=600,height=700") as a popup. (3) Registers a window.addEventListener("message",
      handler) on mount; removes it on unmount. Message handler: validates
      event.origin === "http://localhost:{port}" (port from build-time constant or
      window.location.port); if event.data matches { type: "oauth_complete", serverId }, calls
      onDismiss(). (4) If the popup reference is tracked, close it on dismiss. Log a console.warn
      if origin validation fails (do not act on message).
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test OAuthBanner component: (a) renders serverId in banner text; (b) "Authorize" button
      calls fetchOAuthAuthUrl and opens a popup via window.open; (c) dismiss button calls
      onDismiss; (d) postMessage with { type: "oauth_complete", serverId } from correct origin
      calls onDismiss; (e) postMessage from wrong origin does NOT call onDismiss; (f) postMessage
      with wrong serverId does NOT call onDismiss; (g) event listener is removed on unmount.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Update client/src/components/ServerSidebar.tsx to use the popup OAuth flow. Replace the
      <a href="/api/oauth/start?server=..."> link with a "Connect" button for OAuth servers.
      On click: call startOAuthConnect(serverId); if response is { status: "auth_required",
      authUrl }, open window.open(authUrl, "_blank", "width=600,height=700") as a popup; add a
      window "message" event listener that watches for { type: "oauth_complete", serverId } from
      origin "http://localhost:{port}" — on receipt, call loadServers() to refresh the server
      list and remove the listener. If response is { status: "connected" }, call loadServers()
      immediately. Handle errors with console.error.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test updated ServerSidebar: (a) OAuth server with requiresOAuth=true and connected=false
      renders a "Connect" button (not an <a> link); (b) clicking "Connect" calls
      startOAuthConnect; (c) on auth_required response, window.open is called with authUrl; (d)
      postMessage { type: "oauth_complete", serverId } from correct origin triggers loadServers;
      (e) on direct "connected" response, loadServers is called without opening popup; (f) message
      listener from wrong origin does not trigger loadServers.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Update client/src/components/Chat.tsx to handle auth_required data stream events and show
      OAuthBanner. Changes: (1) Add state: oauthBannerServerId: string | null (null = no banner).
      (2) In the useChat hook, use the onData callback (or equivalent Vercel AI SDK v6 hook) to
      inspect incoming data parts; if a part matches { type: "auth_required", serverId }, set
      oauthBannerServerId = serverId. (3) Render <OAuthBanner serverId={oauthBannerServerId}
      onDismiss={() => setOauthBannerServerId(null)} /> when oauthBannerServerId is non-null. The
      OAuthBanner handles the full popup + postMessage flow internally; Chat only manages
      visibility. (4) If multiple auth_required events arrive for different servers, the latest
      serverId is shown (one banner at a time is sufficient for single-user use).
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
    status: todo

  - task: >
      Test updated Chat.tsx: (a) an auth_required data part with serverId "foo" causes
      OAuthBanner to render with serverId="foo"; (b) OAuthBanner's onDismiss callback hides the
      banner (oauthBannerServerId set to null); (c) no banner is shown when no auth_required data
      part is received; (d) a second auth_required event for a different serverId replaces the
      current banner.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo

  - task: >
      Remove legacy OAuth start route and clean up old module-level state from
      server/routes/oauth.ts. Changes: (1) Delete the GET /oauth/start route handler entirely —
      it is replaced by POST /api/mcp/:serverId/connect + GET /api/mcp/:serverId/auth/url. (2)
      Remove module-level exports: pendingSessions Map, oauthTokens Map, getOAuthToken function.
      These are replaced by MCPClientManager's in-memory oauthClients, tokenSets, and
      pendingStates maps. (3) Remove OAuthDeps interface and defaultDeps if they are no longer
      needed by the refactored callback. (4) Remove the getOAuthToken parameter from
      createChatRouter in server/routes/chat.ts — token attachment is now handled by
      callWithAuth inside MCPClientManager. (5) Update server/index.ts: remove the getOAuthToken
      import from oauth.ts and stop passing it to createChatRouter.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/design.md
      - specs/architecture.md
    status: todo

  - task: >
      Test cleanup for removed legacy OAuth code: (a) delete all tests in
      server/routes/oauth.test.ts that cover GET /oauth/start (including: missing server param,
      unknown server, non-OAuth server, stdio server, redirect to auth URL, pending session
      storage, registerClient call, skip registerClient when client_id pre-configured); (b) remove
      the "mounts GET /api/oauth/start and returns 400" test from server/index.test.ts; (c) remove
      the "stores access token retrievable via getOAuthToken" test and any other tests that import
      or use pendingSessions, oauthTokens, or getOAuthToken from oauth.ts; (d) remove
      getOAuthToken argument from createChatRouter calls in server/routes/chat.test.ts if present;
      (e) verify no remaining test imports reference the removed exports.
    refs:
      - specs/oauth_authorisation/dynamic_registration_oauth_flow/requirements.md
    status: todo
