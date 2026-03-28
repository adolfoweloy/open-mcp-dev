# Design: Servers Management

## Data Model

### `Conversation` (client/src/lib/types.ts)

```ts
export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  isUserRenamed?: boolean;
  enabledServers?: string[];   // NEW: server IDs toggled ON for this chat
}
```

### `ChatRequest` (shared/types.ts)

```ts
export interface ChatRequest {
  messages: UIMessage[];
  model: ModelSelection;
  selectedServers: string[];   // connected servers (tools visible to LLM) — unchanged
  disabledServers: string[];   // NEW: servers toggled OFF (tool calls blocked)
}
```

## Interfaces

### Sidebar toggle callback (App → ServerSidebar)

```ts
interface ServerSidebarProps {
  servers: McpServerStatus[];         // passed down from App (already polled)
  enabledServers: string[];           // from active conversation
  onToggle: (serverId: string) => void;
  onOpenSettings: () => void;
}
```

`App` derives `enabledServers` from `activeConversation.enabledServers ?? connectedServerIds`.

### Tool call blocking (backend)

In the chat handler, before dispatching a tool call:

```ts
if (req.body.disabledServers.includes(serverId)) {
  return { error: `Server '${serverId}' is disabled for this conversation.` };
}
```

`serverId` is extracted from the namespaced tool name (`toolName.split('__')[0]`).

## Component Design

### `ServerSidebar.tsx`

- **Remove** `handleConnect`, `handleDisconnect`, `handleOAuthConnect` and their buttons.
- **Add** `enabledServers: string[]` and `onOpenSettings: () => void` to props.
- Each server row:
  - `<input type="checkbox">` checked when `enabledServers.includes(server.id)`, disabled when `!server.connected`.
  - Server name coloured green (connected) or grey (disconnected/error).
  - If `server.error`: render `<p className="text-xs text-red-400">{server.error}</p>` beneath the label.
- Bottom of component: `<button onClick={onOpenSettings}>Settings</button>` (replaces `⚙`).
- The component no longer owns the server list — `servers` are passed in from `App` (App already polls via `onServersUpdate`).

### `SettingsDrawer.tsx`

- Each server row gains connection action buttons (Reconnect / Connect / Disconnect) alongside existing edit/delete.
- Uses existing `connectServer`, `disconnectServer`, `startOAuthConnect` API functions (move imports from `ServerSidebar`).
- On action completion, calls `onServersUpdate` (or a refresh callback) — same pattern as before.
- Error string from `server.error` displayed in the row.

### `App.tsx`

- Remove gear icon `⚙`; pass `onOpenSettings={() => setIsSettingsOpen(true)}` to `ServerSidebar`.
- Derive `enabledServers` for the active conversation:
  ```ts
  const enabledServers =
    activeConversation?.enabledServers ?? servers.filter(s => s.connected).map(s => s.id);
  ```
- `handleToggleServer(serverId)`: toggles `serverId` in `enabledServers`, writes updated list back to the conversation in state + localStorage.
- Pass `disabledServers` to `Chat` → included in `ChatRequest`:
  ```ts
  const disabledServers = servers
    .filter(s => s.connected && !enabledServers.includes(s.id))
    .map(s => s.id);
  ```

### Sequence: User toggles a server off

```
User clicks checkbox
  → App.handleToggleServer(id)
  → removes id from enabledServers
  → saves updated Conversation to localStorage
  → re-renders ServerSidebar (checkbox unchecked)
  → next ChatRequest includes id in disabledServers
  → backend blocks any tool call from that server
```

## Key Decisions

| Decision | Chosen | Alternative | Why |
|----------|--------|-------------|-----|
| Tools visible when off | Yes (blocked server-side) | Remove from tool list | User asked for Q5=b; LLM can reason "tool unavailable" from error response |
| Sidebar owns polling | No — App passes `servers` in | Sidebar polls independently | Avoids duplicate polling; App already has the list |
| Connection controls location | Settings drawer only | Both sidebar and drawer | Cleaner separation; reduces sidebar clutter |
| Error display | Raw `error` string inline | Human-readable label | User asked for Q7=a |
| Settings entry point | "Settings" text link | Gear icon | User's explicit request; clearer affordance |
