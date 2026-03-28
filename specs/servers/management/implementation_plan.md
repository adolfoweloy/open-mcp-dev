id: servers__management
overview: >
  Separate sidebar (per-chat enable/disable toggle) from settings (connect/disconnect/CRUD);
  replace gear icon with "Settings" link; block tool calls for disabled servers server-side.
status: wip
acceptance_criteria:
  - Sidebar checkboxes toggle servers on/off per conversation; checkbox is disabled and greyed when server is not connected
  - enabledServers is persisted per conversation in localStorage; switching conversations restores each conversation's toggle state
  - Gear icon is replaced with a "Settings" text link that opens the settings drawer
  - Settings drawer shows Connect/Reconnect/Disconnect buttons per server alongside existing edit/delete actions
  - ChatRequest includes disabledServers and the backend returns an error string instead of executing tool calls for disabled servers
  - Server connection errors are displayed as inline muted text beneath the server name in the sidebar
  - New conversations default enabledServers to all currently connected servers
tasks:
  # --- Data model ---
  - task: >
      Add `enabledServers?: string[]` to the `Conversation` interface in `client/src/lib/types.ts`.
      Absence of the field means all connected servers are enabled (backwards compat).
    refs:
      - specs/servers/management/design.md
    priority: high
    status: done

  - task: >
      Add `disabledServers: string[]` to the `ChatRequest` interface in `shared/types.ts`.
      This carries the IDs of servers toggled off for the current conversation to the backend.
    refs:
      - specs/servers/management/design.md
    priority: high
    status: done

  # --- Backend tool-call blocking ---
  - task: >
      In the backend chat handler (`server/routes/chat.ts`), extract `disabledServers` from
      `req.body`. Before dispatching any tool call, extract the server ID from the namespaced
      tool name (`toolName.split('__')[0]`) and check if it is in `disabledServers`. If so,
      return a tool-call error result: `"Server '{id}' is disabled for this conversation."`
      instead of executing the tool. All tools from disabled servers remain in the LLM tool
      list (do not filter them out of `getToolsForAiSdk`).
    refs:
      - specs/servers/management/design.md
      - specs/servers/management/requirements.md
      - specs/architecture.md
    priority: high
    status: done

  - task: >
      Test backend tool-call blocking: (1) tool call from an enabled server executes normally,
      (2) tool call from a disabled server returns the error string without execution,
      (3) missing disabledServers defaults to empty array (no blocking),
      (4) server ID is correctly extracted from namespaced tool name with double-underscore.
    refs:
      - specs/servers/management/requirements.md
    priority: high
    status: done

  # --- App.tsx enabledServers/disabledServers wiring ---
  - task: >
      In `App.tsx`, derive `enabledServers` from the active conversation:
      `activeConversation?.enabledServers ?? servers.filter(s => s.connected).map(s => s.id)`.
      Implement `handleToggleServer(serverId)` that toggles the ID in the enabledServers list,
      writes the updated conversation to state and localStorage immediately. Calculate
      `disabledServers` as connected servers not in enabledServers:
      `servers.filter(s => s.connected && !enabledServers.includes(s.id)).map(s => s.id)`.
      Pass `enabledServers` and `onToggle` to ServerSidebar; pass `disabledServers` to Chat.
      Remove the gear icon button from App and pass `onOpenSettings` to ServerSidebar instead.
    refs:
      - specs/servers/management/design.md
      - specs/servers/management/requirements.md
    priority: high
    status: done

  - task: >
      Test App enabledServers wiring: (1) new conversation defaults enabledServers to all
      connected servers, (2) toggling a server updates enabledServers on the conversation and
      persists to localStorage, (3) switching conversations restores that conversation's
      enabledServers, (4) absence of enabledServers on a loaded conversation defaults to all
      connected, (5) disabledServers is correctly derived as connected minus enabled.
    refs:
      - specs/servers/management/requirements.md
    priority: high
    status: done

  # --- Chat.tsx disabledServers pass-through ---
  - task: >
      Add `disabledServers: string[]` to Chat component props. Include `disabledServers` in the
      `body` object passed to the `useChat` hook so it is sent in every ChatRequest to the backend.
    refs:
      - specs/servers/management/design.md
    priority: high
    status: todo

  - task: >
      Test Chat component: verify that disabledServers is included in the useChat body and
      sent with chat requests.
    refs:
      - specs/servers/management/requirements.md
    priority: high
    status: todo

  # --- ServerSidebar refactor ---
  - task: >
      Refactor `ServerSidebar.tsx`: (1) Remove all connection action handlers and buttons
      (handleConnect, handleDisconnect, handleOAuthConnect and their UI). (2) Remove internal
      polling — component receives `servers: McpServerStatus[]` from parent. (3) Change props
      to accept `servers`, `enabledServers: string[]`, `onToggle`, `onOpenSettings`. (4) Each
      server row: checkbox checked when `enabledServers.includes(server.id)`, disabled when
      `!server.connected`; server name greyed when disconnected. (5) If `server.error` is set,
      render the raw error string as small muted red text beneath the server name. (6) Replace
      gear icon or add a "Settings" text link at the bottom that calls `onOpenSettings`.
    refs:
      - specs/servers/management/design.md
      - specs/servers/management/requirements.md
    priority: medium
    status: todo

  - task: >
      Test ServerSidebar: (1) checkbox is checked for enabled servers and unchecked for disabled,
      (2) checkbox is disabled and greyed when server is not connected, (3) clicking checkbox
      calls onToggle with the correct server ID, (4) error string is rendered beneath server
      name when server.error is set, (5) "Settings" link is present and calls onOpenSettings
      on click, (6) no connect/disconnect/reconnect buttons are rendered.
    refs:
      - specs/servers/management/requirements.md
    priority: medium
    status: todo

  # --- SettingsDrawer connection controls ---
  - task: >
      Add connection action buttons to each server row in `SettingsDrawer.tsx`:
      (1) When disconnected (no error, non-OAuth): show "Reconnect" button calling `connectServer`.
      (2) When disconnected and requires OAuth: show "Connect" button calling `startOAuthConnect`
      and handling the OAuth popup + postMessage flow (move from ServerSidebar's current logic).
      (3) When connected: show "Disconnect" button calling `disconnectServer`.
      (4) When in error state: show "Reconnect" button plus the raw error string.
      (5) After any connection action, call the servers-changed callback to refresh the list.
      Import `connectServer`, `disconnectServer`, `startOAuthConnect` from api.ts.
    refs:
      - specs/servers/management/design.md
      - specs/servers/management/requirements.md
    priority: medium
    status: todo

  - task: >
      Test SettingsDrawer connection controls: (1) connected server shows Disconnect button,
      (2) disconnected server shows Reconnect button, (3) OAuth server shows Connect button,
      (4) error state shows Reconnect button plus error string, (5) clicking action buttons
      calls the correct API function, (6) server list refreshes after connection action.
    refs:
      - specs/servers/management/requirements.md
    priority: medium
    status: todo
