# Chat Debug Panel

## Purpose and Scope

Adds a toggleable, resizable right-side debug panel to the chat UI that displays a real-time structured event log for each conversation. Target audience is developers building and debugging MCP servers — they need visibility into every LLM call, tool invocation, MCP JSON-RPC exchange, OAuth flow, and error that occurs during a chat session.

## Key Design Decisions

- **In-memory only, per-conversation scope** — logs live in React state inside the `DebugContext` provider, which sits at `App` level. Log is cleared via an effect whenever `activeConversationId` changes (including new chat creation). No localStorage, no server persistence.
- **Split event pipeline** — chat-time server events (LLM request/response, MCP tool calls, in-flight OAuth) are piped through the existing `emitEvent` callback in `chat.ts` → Vercel AI SDK data stream → `useChat` `data` → `Chat.tsx` effect → `DebugContext`. Out-of-band events (startup connections, REST-triggered OAuth) are **descoped** — they have no SSE stream to travel on.
- **Split context to avoid over-rendering** — `DebugEmitContext` holds only the `emit` function (stable ref); `DebugLogContext` holds the event array. Components that only emit do not re-render on new log entries.
- **Actor colors as hardcoded Tailwind classes** — color coding is per-actor enum value, not computed from data strings, to stay compatible with Tailwind CSS 4's static scan.
- **Logical MCP events, not wire-level JSON-RPC** — the `@modelcontextprotocol/sdk` `Client` does not expose transport hooks. "MCP client → server" means the logical `callTool` call with arguments; "MCP server → client" means the returned result.
- **Per-step LLM events via `onStepFinish`** — instead of a single request + response pair, the panel emits events for each step of the `streamText` agentic loop (up to `maxSteps`). Each step shows when a request is sent, what the LLM decided (text or tool calls), and how long it took. This gives full visibility into multi-step tool-use flows.
- **Duration tracking** — response and result events include elapsed time (ms) so developers can identify slow steps at a glance.
- **Correlated event grouping** — tool-call and tool-result events share a `correlationId` (the AI SDK's `toolCallId`). The panel groups and indents related events visually.
- **Step separators** — the panel renders visual section headers between LLM steps to make the multi-step flow scannable.
- **Payload cap at 10 KB** — `JSON.stringify(payload).length > 10 240` triggers truncation; the stored payload is the first 10 240 characters of the serialised string with a `[TRUNCATED]` suffix.
- **Downloadable as NDJSON** — one `DebugEvent` JSON object per line in `debug-chat.log`, enabling both human reading and machine parsing.
- **Panel lives at `App` level** — it is a sibling to `Chat`, not a child. This lets it stay open across conversation switches (showing an empty log) and avoids touching the `Chat` component's layout.
- **Subtle toggle affordance** — the panel is toggled via a small tab anchored to the right edge of the main area, not a permanent thick divider bar. The tab is visually lightweight and integrates with the UI.
- **Minimum chat width protection** — the panel cannot be resized wider than would leave the chat area below 400px, preventing the panel from crushing the chat.

## Non-Goals

- Out-of-band event capture (startup connect/disconnect, REST-triggered OAuth flows outside a chat request)
- Raw wire-level JSON-RPC envelope capture
- Per-chunk LLM streaming events
- Log persistence across page reloads
- Multiple panels or per-server tabs

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
