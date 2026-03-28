# Servers: Management

## Purpose and Scope

Refine the MCP server UI into two clearly separated concerns: the **sidebar** (per-chat enable/disable toggle) and the **settings panel** (connect/disconnect/reconnect + CRUD). The gear icon is replaced with a "Settings" text link. Disconnected servers are shown as greyed-out in the sidebar with their error message; users manage connectivity exclusively from settings.

## Key Design Decisions

- **Sidebar = session control only.** The checkbox toggles a server's tools on/off for the current conversation. No connect/disconnect buttons in the sidebar.
- **Settings = connection control + CRUD.** Connect, disconnect, reconnect, add, edit, delete all live in the settings drawer.
- **"Off" ≠ invisible.** When toggled off, a server's tools remain in the LLM's tool list but calls are blocked server-side (error returned). This mirrors Q5 intent: LLM sees tools but can't execute them.
- **Per-chat persistence.** Toggle state stored as `enabledServers: string[]` on the `Conversation` object in localStorage. Defaults to all connected servers enabled on new chats.
- **Error visibility.** If a server has a connection error, the raw `error` string from `McpServerStatus` is shown inline in the sidebar beneath the server name (greyed, non-interactive).
- **"Settings" link** replaces the `⚙` gear icon at the bottom-left of the sidebar.

## Non-Goals

- No per-server tool-level enable/disable (whole server only).
- No retry button in the sidebar (reconnect is in settings only).
- No visual distinction between "toggled off by user" and "disconnected" beyond greying.
- No changes to auth/OAuth flows.

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
