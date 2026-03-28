id: root__server_settings_ui
overview: >
  Settings drawer UI for adding, editing, and deleting MCP servers from the browser.
  Backend: ConfigWriter service for serialised config.yaml writes, MCPClientManager CRUD methods
  for hot-reload, REST endpoints under /api/config/servers with sensitive-field scrubbing.
  Frontend: gear button, slide-over drawer, server form modal.
status: wip
acceptance_criteria:
  - GET /api/config/servers returns all configured servers with sensitive fields (client_secret, access_token, refresh_token) replaced by boolean presence flags — never raw values
  - POST /api/config/servers creates a new server entry in config.yaml and hot-connects it; the server appears in the drawer with a connecting/connected status badge
  - PUT /api/config/servers/:id updates (and optionally renames) an existing server, persists to config.yaml, and reconnects; rename clears all 5 OAuth state Maps for the old id
  - DELETE /api/config/servers/:id removes the server from config.yaml, disconnects it, and clears all OAuth state Maps
  - Concurrent config writes do not corrupt config.yaml (promise-chained queue in ConfigWriter)
  - The settings drawer opens from a gear icon at the bottom-left of the sidebar and lists every server with name, type badge, and live connection status badge
  - The add/edit form validates required fields, handles stdio vs http field sets, and preserves unchanged sensitive fields via null sentinel
tasks:
  # --- Shared types ---
  - task: >
      Extend McpServerStatus in shared/types.ts: add `type: 'stdio' | 'http'` and
      `error?: string` fields. Add new types: ScrubbedMcpServerConfig (discriminated union
      for stdio/http with boolean has_* flags for sensitive fields), ServerConfigsResponse
      (Record<string, ScrubbedMcpServerConfig>), AddServerRequest ({ id: string, config: McpServerConfig }),
      UpdateServerRequest ({ newId?: string, config: McpServerConfig }).
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/architecture.md
    priority: high
    status: done

  - task: >
      Test shared types: verify McpServerStatus includes type and error fields via a
      type-level assertion or runtime construction test. Verify ScrubbedMcpServerConfig
      discriminated union works correctly for both stdio and http variants.
    refs:
      - specs/root/server_settings_ui/design.md
    priority: high
    status: done

  # --- MCPClientManager CRUD ---
  - task: >
      Add serverConfigs Map and CRUD methods to MCPClientManager in server/lib/mcp-manager.ts.
      (1) Store serverConfigs: Map<string, McpServerConfig> populated during connectAll.
      (2) addServer(id, config): add to serverConfigs, call connectToServer.
      (3) updateServer(oldId, newId, config): if rename, call removeServer(oldId) then
      addServer(newId, config); otherwise disconnect(id), update serverConfigs, reconnect.
      (4) removeServer(id): disconnect, delete from serverConfigs, and clear all 5 OAuth
      state Maps (oauthClients, tokenSets, authLocks, pendingStates, oauthServerUrls).
      (5) getServerConfigs(): return the Map.
      (6) Update getServerStatuses() to use internal serverConfigs (no parameter), and
      include type and error fields in the returned McpServerStatus objects.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/root/server_settings_ui/requirements.md
      - specs/architecture.md
    priority: high
    status: done

  - task: >
      Test MCPClientManager CRUD: (a) addServer registers config and calls connectToServer,
      (b) updateServer with same id disconnects and reconnects with new config,
      (c) updateServer with rename removes old id from all Maps and registers new id,
      (d) removeServer disconnects and clears all 5 OAuth Maps,
      (e) getServerStatuses returns type and error fields,
      (f) getServerConfigs returns current Map state after add/update/remove sequences.
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: high
    status: done

  # --- ConfigWriter service ---
  - task: >
      Create server/lib/config-writer.ts with ConfigWriter class. Methods:
      addServer(id, config) — reads config.yaml, adds server entry, writes back.
      updateServer(oldId, newId, config) — replaces key (handles rename by deleting old
      key and inserting new key), writes back.
      removeServer(id) — deletes key, writes back.
      All operations serialised through a promise-chained queue:
      this.queue = this.queue.then(() => op()). Uses js-yaml for parse/dump.
      readYaml() reads from the config path (same path resolution as loadConfig).
      writeYaml(config) writes the full Config object back to disk.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/architecture.md
    priority: high
    status: todo

  - task: >
      Test ConfigWriter: (a) addServer writes new entry to yaml file and it round-trips
      correctly, (b) updateServer with rename replaces key preserving other entries,
      (c) removeServer deletes key, (d) concurrent calls (3+ simultaneous addServer)
      serialise correctly — no data loss, (e) readYaml/writeYaml preserve non-server
      config sections (llm settings etc).
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: high
    status: todo

  # --- Config REST endpoints ---
  - task: >
      Create server/routes/config.ts with 4 endpoints:
      GET /api/config/servers — reads MCPClientManager.getServerConfigs(), scrubs
      client_secret/access_token/refresh_token replacing with has_* boolean flags,
      returns ServerConfigsResponse.
      POST /api/config/servers — validates AddServerRequest body (id required, config
      fields validated per type), calls ConfigWriter.addServer then MCPClientManager.addServer,
      returns 201 with id and McpServerStatus. 400 if id already exists, 422 for validation errors.
      PUT /api/config/servers/:id — validates UpdateServerRequest, merges null sentinel
      fields with existing values for sensitive fields, calls ConfigWriter.updateServer
      then MCPClientManager.updateServer, returns 200. 404 if not found, 400 if newId conflicts.
      DELETE /api/config/servers/:id — calls ConfigWriter.removeServer then
      MCPClientManager.removeServer, returns 204. 404 if not found.
      Register routes in server/index.ts under /api/config prefix.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/root/server_settings_ui/requirements.md
      - specs/architecture.md
    priority: high
    status: todo

  - task: >
      Test config routes: (a) GET /api/config/servers returns scrubbed configs — assert
      no client_secret/access_token/refresh_token values present, has_* flags are correct,
      (b) POST creates server and returns 201 with status, returns 400 for duplicate id,
      422 for missing required fields, (c) PUT updates config and returns 200, handles
      rename, returns 404 for unknown id, preserves sensitive fields when null sent,
      (d) DELETE returns 204, returns 404 for unknown id.
      Include a security-focused test asserting GET response JSON never contains raw
      secret values regardless of input config.
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: high
    status: todo

  # --- Frontend API functions ---
  - task: >
      Add API functions to client/src/lib/api.ts:
      fetchServerConfigs() — GET /api/config/servers → ServerConfigsResponse.
      addServer(id, config) — POST /api/config/servers → { id, status }.
      updateServer(id, body) — PUT /api/config/servers/:id → { id, status }.
      deleteServer(id) — DELETE /api/config/servers/:id → void.
    refs:
      - specs/root/server_settings_ui/design.md
    priority: medium
    status: todo

  - task: >
      Test frontend API functions: mock fetch, verify each function sends correct
      method/path/body and parses response correctly. Test error handling for non-ok responses.
    refs:
      - specs/root/server_settings_ui/design.md
    priority: medium
    status: todo

  # --- Settings Drawer ---
  - task: >
      Create SettingsDrawer component (client/src/components/SettingsDrawer.tsx).
      Slide-over panel, position fixed, left-anchored, z-index above sidebar, rendered
      via ReactDOM.createPortal into document.body. On open: fetch server configs via
      fetchServerConfigs(). Merge with live statuses from existing 5s poll (match by
      server id). Render one ServerRow per server showing: name, type badge (stdio|http),
      connection status badge (connecting|connected|error with message tooltip).
      Add Server button at top. Each row has Edit and Delete buttons. Delete shows
      browser confirm() dialog then calls deleteServer API. Close on clicking outside
      or X button. Add isSettingsOpen state to App.tsx, toggle from gear button.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/root/server_settings_ui/requirements.md
      - specs/architecture.md
    priority: medium
    status: todo

  - task: >
      Test SettingsDrawer: (a) renders server list with correct names, type badges, and
      status badges when configs and statuses are provided, (b) calls deleteServer on
      confirm and refreshes list, (c) opens add form when Add Server clicked,
      (d) opens edit form pre-populated when Edit clicked, (e) closes on outside click.
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: medium
    status: todo

  # --- Server Form Modal ---
  - task: >
      Create ServerFormModal component (client/src/components/ServerFormModal.tsx).
      Shared form for add and edit modes. Fields: Name (text, required), Type (radio
      stdio|http, required, disabled in edit mode), Timeout (number, optional).
      stdio fields: Command (text, required), Args (text, space-separated, parsed to
      array on save), Env (dynamic key=value rows with add/remove buttons).
      http fields: URL (text, required), Prefer SSE (checkbox), OAuth enabled (checkbox
      toggle), OAuth sub-fields when enabled: Client ID (required), Client Secret
      (optional), Access Token (optional), Refresh Token (optional).
      All fields plain text with note "Fields are shown in plain text because this is
      a local-only app". In edit mode, sensitive fields show "(saved)" placeholder
      when has_* is true; unchanged placeholder sends null, cleared sends empty string.
      Validate required fields on submit. On save: call addServer or updateServer API,
      then refresh drawer list. Render as modal via portal.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/root/server_settings_ui/requirements.md
    priority: medium
    status: todo

  - task: >
      Test ServerFormModal: (a) renders stdio-specific fields when stdio selected,
      http-specific fields when http selected, (b) validates required fields — name,
      command for stdio, url for http, client_id when oauth enabled — shows error on
      empty, (c) in edit mode, type selector is disabled, sensitive fields show "(saved)"
      placeholder, (d) submitting with unchanged sensitive placeholder sends null,
      clearing sends empty string, (e) env rows can be added/removed, (f) args string
      split into array on submit.
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: medium
    status: todo

  # --- Gear Button ---
  - task: >
      Add gear icon button to the sidebar in App.tsx or ServerSidebar.tsx. Position
      fixed at bottom-left of sidebar, below server list. Clicking toggles
      isSettingsOpen state which controls SettingsDrawer visibility. Use a standard
      gear/cog SVG icon consistent with existing UI style.
    refs:
      - specs/root/server_settings_ui/design.md
      - specs/root/server_settings_ui/requirements.md
    priority: medium
    status: todo

  - task: >
      Test gear button: (a) renders in sidebar, (b) clicking toggles settings drawer
      open/closed state.
    refs:
      - specs/root/server_settings_ui/requirements.md
    priority: medium
    status: todo
