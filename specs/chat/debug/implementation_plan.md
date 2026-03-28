id: chat__debug
overview: >
  Right-side toggleable/resizable debug panel showing real-time per-conversation event logs
  (LLM calls, MCP tool calls, OAuth events, errors) with actor color-coding, expandable
  payloads, and NDJSON download. Server emits debug events through the Vercel AI SDK data
  stream; frontend consumes them via a split DebugContext and renders in a DebugPanel component.
status: todo
acceptance_criteria:
  - Debug panel opens/closes via a toggle handle on the right edge of the chat area; chat area shrinks to accommodate (no overlay)
  - LLM request and response events appear in the log with model id, token usage, and finish reason
  - MCP tool call, result, and error events appear in the log with tool name and payload
  - OAuth flow events (start, token received, token refreshed) appear in the log with server id
  - Each log entry shows timestamp, color-coded actor label, and summary; clicking expands to show full JSON payload
  - Switching or creating a conversation clears the debug log
  - Download button exports the log as NDJSON; Clear button resets the log
tasks:
  # --- Data model & types ---
  - task: >
      Add `DebugActor` type and `DebugEvent` interface to `client/src/lib/types.ts`:
      `DebugActor = 'llm' | 'mcp-client' | 'mcp-server' | 'oauth' | 'bridge' | 'error'`.
      `DebugEvent` has fields: `id` (string, UUID), `timestamp` (Date), `actor` (DebugActor),
      `type` (string, e.g. 'request'|'response'|'tool-call'|'tool-result'|'tool-error'|
      'oauth-start'|'oauth-token'|'oauth-refresh'), `summary` (string), optional `payload`
      (string, JSON-serialised, capped at 10240 chars + '[TRUNCATED]'), optional `correlationId`
      (string). Add `StreamDebugEvent` interface to `shared/types.ts`:
      `{ type: 'debug'; event: Omit<DebugEvent, 'timestamp'> & { timestamp: string } }`.
      Add `serializePayload(data: unknown): string` helper that JSON.stringify's with 2-space
      indent, truncates at 10240 chars with '\n[TRUNCATED]' suffix.
    refs:
      - specs/chat/debug/design.md
    priority: high
    status: done

  - task: >
      Test DebugEvent types and serializePayload helper: (1) payload under 10240 chars is
      returned unchanged, (2) payload over 10240 chars is truncated to exactly 10240 chars
      plus '\n[TRUNCATED]' suffix, (3) undefined/null input returns empty string or handles
      gracefully, (4) circular references are handled without throwing.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # --- DebugContext (split context) ---
  - task: >
      Create `client/src/lib/debug-context.tsx` with a split-context pattern:
      `DebugEmitContext` provides `{ emit: (event: DebugEvent) => void, clear: () => void }`
      (stable refs via useCallback); `DebugLogContext` provides `DebugEvent[]`.
      `DebugProvider` component wraps children in both providers, manages events state via
      useState. `useDebugEmit()` returns the emit context (stable, does not re-render on log
      changes). `useDebugLog()` returns the events array (only DebugPanel consumes this).
      Export all four: DebugProvider, useDebugEmit, useDebugLog, and the context objects for
      testing.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Test DebugContext: (1) emit adds events to the log, (2) clear resets log to [],
      (3) useDebugEmit returns a stable reference across re-renders (verify with ref comparison),
      (4) components using only useDebugEmit do not re-render when log changes (verify render
      count), (5) useDebugLog consumers receive updated events after emit.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # --- Server-side debug event emission ---
  - task: >
      In `server/routes/chat.ts`, emit debug events through `dataStreamWriter.writeData()`:
      (1) Before `streamText`: emit LLM request event with actor='llm', type='request',
      summary including model id, payload containing system prompt and messages array.
      (2) In `streamText` `onFinish` callback: emit LLM response event with actor='llm',
      type='response', summary with finish reason, payload with token usage and assistant text.
      (3) In `getToolsForAiSdk` tool execute wrapper (mcp-manager.ts): emit mcp-client
      tool-call event (actor='mcp-client', type='tool-call', summary with tool name, payload
      with args) before calling `callWithAuth`; emit mcp-server tool-result event
      (actor='mcp-server', type='tool-result', payload with result) on success; emit error
      event (actor='error', type='tool-error', summary with error message) on failure.
      (4) In OAuth flow within `callWithAuth`: emit oauth events (actor='oauth',
      type='oauth-start'/'oauth-token'/'oauth-refresh') at the relevant points.
      Use `serializePayload` for all payloads. Use `crypto.randomUUID()` for event ids.
      Wrap all emit calls in try/catch to silently swallow serialisation errors.
      Format events as `StreamDebugEvent` with ISO timestamp string.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
      - specs/architecture.md
    priority: high
    status: todo

  - task: >
      Test server-side debug event emission: (1) chat request emits LLM request event before
      streamText and LLM response event in onFinish, (2) tool call emits mcp-client event
      before execution and mcp-server event on success, (3) tool call error emits error event,
      (4) OAuth flow emits oauth-start/token/refresh events at correct points, (5) payloads
      are serialised and truncated correctly, (6) emission errors are swallowed silently
      without affecting chat flow, (7) all events have type='debug' wrapper for data stream.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # --- Frontend event ingestion (Chat.tsx) ---
  - task: >
      In `Chat.tsx`, add a `useEffect` on the `data` array from `useChat` that filters for
      entries where `type === 'debug'`, deserialises the `timestamp` field from ISO string
      to `Date`, and calls `emit()` from `useDebugEmit()` for each new debug event.
      Ensure events are not re-emitted on re-render (track last processed index via useRef).
      Chat.tsx must be wrapped by DebugProvider (done at App level).
    refs:
      - specs/chat/debug/design.md
    priority: high
    status: todo

  - task: >
      Test Chat.tsx debug event ingestion: (1) debug events in useChat data are forwarded to
      DebugContext via emit, (2) non-debug data entries are ignored, (3) events are not
      re-emitted on component re-render, (4) timestamp is correctly deserialised from ISO
      string to Date object.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # --- App.tsx layout and wiring ---
  - task: >
      In `App.tsx`: (1) Wrap the main content area with `DebugProvider`. (2) Add state for
      `isDebugOpen` (boolean, default false) and `debugPanelWidth` (number, default 400).
      (3) Add a `useEffect` that calls `clear()` from `useDebugEmit()` whenever
      `activeConversationId` changes (including null from deletion). (4) Render layout as
      flex row: sidebar | chat (flex:1) | DebugToggleHandle | DebugPanel (conditional).
      The main content area gets `overflow: hidden` so the panel doesn't cause horizontal
      scroll. Chat area shrinks to accommodate the panel (flex layout, not overlay).
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Test App.tsx debug wiring: (1) DebugProvider wraps content, (2) toggling debug panel
      updates isDebugOpen state, (3) switching conversation clears debug log, (4) creating
      new conversation clears debug log, (5) deleting active conversation clears debug log,
      (6) panel renders as sibling to chat in flex layout.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # --- DebugPanel component ---
  - task: >
      Create `client/src/components/DebugPanel.tsx` with props: `isOpen`, `width`, `onClose`,
      `onWidthChange`. Internally uses `useDebugLog()` for event list. Features:
      (1) Scrollable event list, newest at bottom, with auto-scroll to bottom on new events
      unless user has manually scrolled up (track via onScroll handler + ref).
      (2) Each entry: `[HH:MM:SS.mmm]` timestamp, `[ACTOR]` label with hardcoded Tailwind
      color classes (llm→text-blue-400, mcp-client→text-purple-400, mcp-server→text-green-400,
      oauth→text-orange-400, bridge→text-pink-400, error→text-red-400), summary text.
      (3) Clicking entry toggles expanded state showing formatted JSON payload (or truncated
      string with [TRUNCATED] marker). (4) Left-border resize handle: onMouseDown starts
      drag, tracks delta, calls onWidthChange with clamped value (min 240px, max 80vw).
      (5) Header with "Debug" title, Clear button (calls clear from useDebugEmit), and
      Download button. (6) Panel width set via inline style from props.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Test DebugPanel: (1) renders event list from useDebugLog, (2) each entry shows formatted
      timestamp, actor label with correct color class, and summary, (3) clicking entry toggles
      payload expansion, (4) auto-scrolls to bottom on new event, (5) does not auto-scroll
      when user has scrolled up, (6) Clear button calls clear, (7) resize drag updates width
      within min/max bounds, (8) empty state renders gracefully.
    refs:
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  # --- DebugToggleHandle ---
  - task: >
      Create `client/src/components/DebugToggleHandle.tsx`: a thin vertical strip rendered on
      the right edge of the chat column. Always visible regardless of panel state. Clicking
      toggles the debug panel open/closed. Visual: narrow bar (e.g. 12px wide) with a
      chevron or bug icon indicating open/close direction. Props: `isOpen: boolean`,
      `onToggle: () => void`.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Test DebugToggleHandle: (1) renders and is visible, (2) clicking calls onToggle,
      (3) visual indicator reflects isOpen state.
    refs:
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  # --- Download functionality ---
  - task: >
      Implement NDJSON download in DebugPanel: Download button creates a Blob from
      `events.map(e => JSON.stringify(e)).join('\n')` with type 'application/x-ndjson',
      creates an object URL, triggers download via a temporary `<a download="debug-chat.log">`
      element, then revokes the URL. Handle empty log gracefully (disable button or download
      empty file).
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: low
    status: todo

  - task: >
      Test NDJSON download: (1) download produces valid NDJSON with one event per line,
      (2) each line is parseable as a DebugEvent JSON object, (3) filename is 'debug-chat.log',
      (4) empty log case is handled.
    refs:
      - specs/chat/debug/requirements.md
    priority: low
    status: todo
