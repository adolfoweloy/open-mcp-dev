# Server Settings UI

## Purpose and Scope

Adds a settings drawer to the bottom-left of the sidebar (gear icon, same placement as ChatGPT/Claude Desktop) that lets the user **add, edit, and delete MCP servers from the UI** without touching `config.yaml` manually. Changes persist to `config.yaml` and hot-reload the connection immediately — no process restart required.

This feature also confirms that the MCP client implementation fully supports runtime server registration so that iframe Apps SDK resources can use tools from any connected server automatically.

## Key Design Decisions

- **Persist to `config.yaml`** via new `/api/config/servers` REST endpoints; the config file remains the single source of truth
- **Promise-chained write queue** in the config service prevents read-modify-write races on disk
- **Hot-reload** via new `addServer / updateServer / removeServer` methods on `MCPClientManager`, which maintains an internal `serverConfigs` Map
- **Separate status and config endpoints** — the existing `GET /api/mcp/servers` (polled every 5 s) is unchanged; the new `GET /api/config/servers` serves the drawer only and scrubs sensitive fields
- **Sensitive fields scrubbed** in API responses: `client_secret`, `access_token`, `refresh_token` replaced with boolean presence flags; the frontend sends `null` for unchanged fields on update, preserving the stored value
- **Plain-text fields** with an explanatory note in the UI: "Fields are shown in plain text because this is a local-only app"
- **All connected servers auto-exposed to iframes** (no per-server toggle); this is already the default behaviour of `getToolsForAiSdk(undefined)`
- **Name is the config key** — renaming replaces the old key; in-flight chats using the old name will see a tool error (known acceptable edge case)

## Non-Goals

- ~~Dynamic MCP server registration~~ (now implemented — this was previously a non-goal)
- Masking or encrypting secrets at rest in `config.yaml`
- Multi-user or remote access scenarios
- Per-server iframe exposure toggle
- Drag-to-reorder servers

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
