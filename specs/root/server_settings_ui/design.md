# Design

## Data Model

### Shared types (`shared/types.ts`)

```typescript
// Existing — unchanged
type McpServerStatus = {
  id: string;
  connected: boolean;
  requiresOAuth: boolean;
  type: 'stdio' | 'http';  // ADD: for drawer type badge
  error?: string;          // ADD: last connection error message
};

// New — returned by GET /api/config/servers
type ScrubbedMcpServerConfig =
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
      timeout?: number;
    }
  | {
      type: 'http';
      url: string;
      timeout?: number;
      prefer_sse?: boolean;
      oauth?: {
        client_id: string;
        has_client_secret: boolean;
        has_access_token: boolean;
        has_refresh_token: boolean;
      };
    };

// GET /api/config/servers response
type ServerConfigsResponse = Record<string, ScrubbedMcpServerConfig>;

// POST /api/config/servers body
type AddServerRequest = {
  id: string;
  config: McpServerConfig; // full config from server/config.ts
};

// PUT /api/config/servers/:id body
type UpdateServerRequest = {
  newId?: string;          // present only if renaming
  config: McpServerConfig; // null for sensitive fields means "keep existing"
};
```

### Config service (`server/lib/config-writer.ts`) — new file

```typescript
class ConfigWriter {
  private queue: Promise<void> = Promise.resolve();

  addServer(id: string, config: McpServerConfig): Promise<void>;
  updateServer(oldId: string, newId: string, config: McpServerConfig): Promise<void>;
  removeServer(id: string): Promise<void>;

  private enqueue(op: () => Promise<void>): Promise<void>;
  private readYaml(): Config;
  private writeYaml(config: Config): void;
}
```

Each operation is serialised through `this.queue = this.queue.then(() => op())`.

## Interfaces

### New API endpoints (`server/routes/config.ts`) — new file

```
GET  /api/config/servers
  → 200 ServerConfigsResponse (sensitive fields scrubbed)

POST /api/config/servers
  Body: AddServerRequest
  → 201 { id: string, status: McpServerStatus }
  → 400 { error: 'Server ID already exists' }
  → 422 { error: 'Validation error: ...' }

PUT  /api/config/servers/:id
  Body: UpdateServerRequest
  → 200 { id: string, status: McpServerStatus }
  → 404 { error: 'Server not found' }
  → 400 { error: 'New server ID already exists' }

DELETE /api/config/servers/:id
  → 204 No Content
  → 404 { error: 'Server not found' }
```

### MCPClientManager additions (`server/lib/mcp-manager.ts`)

```typescript
// Internal state addition
private serverConfigs: Map<string, McpServerConfig>;

// New public methods
addServer(id: string, config: McpServerConfig): Promise<void>;
updateServer(oldId: string, newId: string, config: McpServerConfig): Promise<void>;
removeServer(id: string): Promise<void>;
getServerConfigs(): Map<string, McpServerConfig>;

// Modified method signature
getServerStatuses(): McpServerStatus[];  // uses internal serverConfigs (no parameter)
```

`removeServer` must clear: `this.clients`, `this.oauthClients`, `this.tokenSets`, `this.authLocks`, `this.pendingStates`, `this.oauthServerUrls` — all keyed by `id`.

### Frontend: new components

**`SettingsDrawer.tsx`**
- Slide-over panel, `position: fixed`, left-anchored, z-index above sidebar
- Loads server configs from `GET /api/config/servers` on open
- Merges with live statuses from the existing 5 s poll
- Renders a `ServerRow` per server and an **Add Server** button

**`ServerFormModal.tsx`** (or in-drawer form)
- Controlled form for add/edit
- Fields rendered conditionally based on selected type
- Env rows: array of `{ key: string, value: string }` in local state; serialised to `Record<string, string>` on submit
- Args field: text input; split on spaces to produce `string[]` on submit
- Sensitive fields: show `(saved)` as placeholder when `has_*` is true; submitting unchanged placeholder sends `null`; clearing sends `""`

**`GearButton.tsx`** (or inline in `App.tsx` / `ServerSidebar.tsx`)
- Fixed position at bottom-left of sidebar
- Toggles `isSettingsOpen` state

## Component Design

### Where the gear button lives

The gear icon sits at the bottom of the left sidebar, below `ServerSidebar`. `App.tsx` owns `isSettingsOpen` state and renders `<SettingsDrawer>` as a sibling to the sidebar (portal into `document.body` to escape overflow containment, following the existing dropdown pattern).

### Sequence: Add Server

```
User fills form → Submit
  → POST /api/config/servers
      → ConfigWriter.addServer (writes config.yaml)
      → MCPClientManager.addServer (registers + connects)
  → Response: 201 with status
  → SettingsDrawer refreshes server list
  → Status badge shows "connecting" then "connected"
```

### Sequence: Edit Server (no rename)

```
User edits form → Save
  → PUT /api/config/servers/:id  { config: {...} }
      → ConfigWriter.updateServer
      → MCPClientManager.updateServer
          → disconnectServer(id) + clear OAuth Maps
          → connectToServer(id, newConfig)
  → Response: 200 with status
```

### Sequence: Rename Server

```
User changes name field → Save
  → PUT /api/config/servers/:oldId  { newId: "new-name", config: {...} }
      → ConfigWriter.updateServer (replaces key in YAML)
      → MCPClientManager.updateServer
          → removeServer(oldId)   [disconnect + clear all Maps]
          → addServer(newId, config) [register + connect]
  → App.tsx filters selectedServers on next poll: stale "old-name" entry removed
```

### Sequence: Delete Server

```
User confirms delete
  → DELETE /api/config/servers/:id
      → ConfigWriter.removeServer
      → MCPClientManager.removeServer
          → disconnectServer(id)
          → clear all 5 OAuth Maps for id
  → 204 response
  → SettingsDrawer removes row; server disappears from sidebar
```

## Key Decisions

| Decision | Choice | Alternative Considered |
|----------|--------|------------------------|
| Config persistence | Write back to `config.yaml` | Separate `servers.json` — rejected: would require merge logic and two sources of truth |
| Write serialisation | Promise-chained queue in `ConfigWriter` | External file lock (e.g. `proper-lockfile`) — rejected: overkill for single-user local app |
| Sensitive field handling | Scrub in API response; `null` sentinel for unchanged on update | Always expose plain text — rejected: breaks existing security invariant (tokens never sent to frontend) |
| Hot-reload | Disconnect + reconnect immediately | Restart required — rejected: user-hostile for a running chat session |
| Iframe exposure | All connected servers, automatic | Per-server toggle — rejected: unnecessary complexity; current default already works |
| Form location | In-drawer form (or modal) | Full-page settings route — rejected: inconsistent with ChatGPT/Claude Desktop UX |
| Status in drawer | Badge per row, refreshed from existing 5 s poll | Separate status fetch on open — rejected: wastes bandwidth; polling already in flight |
