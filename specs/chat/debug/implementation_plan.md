id: chat__debug
overview: >
  Right-side toggleable/resizable debug panel showing real-time per-conversation event logs
  with full visibility into the LLM agentic loop: per-step tracking, tool decisions, MCP
  tool calls with durations, OAuth events, and errors. Features step separators, correlated
  event grouping, directional indicators, duration badges, quick filters, and a lightweight
  panel toggle. Server emits debug events through the Vercel AI SDK data stream; frontend
  consumes them via a split DebugContext and renders in a DebugPanel component.
status: todo
acceptance_criteria:
  - Debug panel opens/closes via a lightweight tab on the right edge of the chat area (not a thick bar); chat area shrinks to accommodate (no overlay)
  - Panel default width is 340px; minimum chat area width of 400px is always preserved
  - Resize handle has a wide grab area (8px) and shows visual feedback on hover
  - Each LLM step is separated by a visual section header (e.g. "Step 1", "Step 2")
  - LLM step-start events show model, tool count, and message count
  - LLM step-finish events show finish reason, token usage, and duration
  - When the LLM decides to call tools (finishReason=tool-calls), a tool-decision event lists the chosen tools and arguments
  - MCP tool-call and tool-result/error events are visually grouped by correlationId (result indented under call)
  - Tool result and LLM response events show elapsed duration inline
  - Outgoing events show → prefix; incoming events show ← prefix
  - Each event has a colour-coded left border matching its actor
  - Quick filter toggles (LLM | MCP | OAuth | Errors) in the panel header filter the event list
  - Download button exports the log as NDJSON; Clear button resets the log
  - Switching or creating a conversation clears the debug log
tasks:
  # ── Phase 1: Panel UX fixes (frontend only, no server changes) ──

  - task: >
      Replace DebugToggleHandle with a lightweight tab. Remove the current 12px-wide
      always-visible dark bar. Replace with a small tab button anchored to the right
      edge of the main content area. The tab should be visually subtle — e.g. a short
      vertical "Debug" label or a small bug icon in a rounded tab. When the panel is
      open, the tab should either merge into the panel header or sit on the panel's
      left edge. It must not create a thick visual divider between chat and panel.
      Props remain: `isOpen: boolean`, `onToggle: () => void`.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: done

  - task: >
      Test DebugToggleHandle: (1) renders and is visible, (2) clicking calls onToggle,
      (3) visual indicator reflects isOpen state, (4) does not render as a thick bar
      (verify width is appropriate for a tab, not a full-height divider).
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Update default panel width and add minimum chat width protection. Change default
      `debugPanelWidth` from 400 to 340 in App.tsx. Update resize clamping logic in
      DebugPanel to use `max = window.innerWidth - 280 (sidebar) - 400 (min chat)`
      instead of `80vw`. Ensure the chat area has `min-width: 400px` or equivalent
      flex constraint so the panel can never crush it below 400px.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Improve resize handle discoverability. Widen the invisible grab area to 8px
      (use absolute positioning with negative offset so it extends beyond the panel
      border). Keep the visible line at 1px. Add hover feedback: change the visible
      line colour or show a subtle drag indicator. Ensure cursor is `col-resize`
      across the full grab area.
    refs:
      - specs/chat/debug/design.md
    priority: medium
    status: todo

  - task: >
      Test resize handle: (1) drag updates width within min/max bounds, (2) max width
      preserves at least 400px for the chat area, (3) cursor changes to col-resize on
      the grab area.
    refs:
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  # ── Phase 2: Enrich server-side events ──

  - task: >
      Add `step`, `durationMs` fields to DebugEvent interface in `client/src/lib/types.ts`
      and StreamDebugEvent in `shared/types.ts`. Both are optional numbers. Update
      `serializePayload` if needed (no changes expected). Add new event types to the
      DebugEvent type documentation: 'step-start', 'step-finish', 'tool-decision'.
    refs:
      - specs/chat/debug/design.md
    priority: high
    status: todo

  - task: >
      Replace single LLM request/response events with per-step events in chat.ts.
      Use `streamText`'s `onStepFinish` callback to emit per-step events. Track step
      count with a counter variable incremented in `onStepFinish`. For each step:
      (1) Emit `llm/step-start` at the beginning (before `streamText` for step 1;
      inside `onStepFinish` for subsequent steps — emit the *next* step's start when
      the current step finishes with `finishReason: 'tool-calls'`).
      (2) In `onStepFinish`: if `finishReason === 'tool-calls'`, emit `llm/tool-decision`
      with the list of tool names and arguments the LLM chose.
      (3) Emit `llm/step-finish` with step number, finish reason, token usage, and
      duration (elapsed from step-start to step-finish, tracked via `Date.now()`).
      Remove the old `llm/request` and `llm/response` events. The step-start event
      for step 1 should include the list of available tool names (not full schemas)
      and the message count.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Add duration tracking to MCP tool calls in mcp-manager.ts. In the `execute`
      wrapper inside `getToolsForAiSdk`, record `startTime = Date.now()` before
      calling `callWithAuth`. On success, include `durationMs: Date.now() - startTime`
      in the `mcp-server/tool-result` event. On error, include `durationMs` in the
      `error/tool-error` event.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Test server-side event emission: (1) step-start event is emitted before streamText
      with model, tool count, and message count, (2) onStepFinish emits step-finish with
      step number, finish reason, usage, and durationMs, (3) when finishReason is
      'tool-calls', a tool-decision event is emitted listing chosen tools, (4) subsequent
      steps emit a new step-start, (5) tool-call events include correlationId, (6) tool-result
      events include durationMs and correlationId, (7) tool-error events include durationMs and
      correlationId, (8) all events have type='debug' wrapper, (9) emission errors are swallowed.
    refs:
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  # ── Phase 3: Improve event presentation in the panel ──

  - task: >
      Add step separators to DebugPanel. When rendering the event list, detect
      `step-start` events and render a visual section header before them:
      `─── Step N ──────────────────────────`. Use a thin horizontal rule with
      the step label centred. Style with muted text colour and subtle borders.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: high
    status: todo

  - task: >
      Add directional indicators to event entries. Outgoing events (types:
      'step-start', 'tool-call') get a `→` prefix before the summary. Incoming
      events (types: 'step-finish', 'tool-decision', 'tool-result', 'tool-error')
      get a `←` prefix. Other events (oauth, etc.) get no prefix.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Add duration badges to event entries. For events with a `durationMs` field,
      display the duration inline after the summary text. Format: `(1.2s)` for
      durations >= 1000ms, `(430ms)` for durations < 1000ms. Use a muted text
      colour for the badge.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Add colour-coded left borders to event entries. Each event entry gets a 3px
      left border coloured by its actor. Use hardcoded Tailwind border classes
      (border-blue-400 for llm, border-purple-400 for mcp-client, etc.) matching
      the existing actor colour scheme.
    refs:
      - specs/chat/debug/design.md
    priority: medium
    status: todo

  - task: >
      Add correlated event grouping. When rendering the event list, detect events
      with a `correlationId` that matches a preceding `tool-call` event's
      `correlationId`. Indent these events (tool-result, tool-error) under the
      matching tool-call — e.g. add left margin/padding to visually nest them.
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Add quick filter toggles to the DebugPanel header. Add a row of small toggle
      buttons below the title: `LLM | MCP | OAuth | Errors`. All enabled by default.
      Clicking a filter toggles it off/on. Filter logic: show event if its actor
      matches any enabled filter. `LLM` = actor 'llm', `MCP` = actors 'mcp-client'
      and 'mcp-server', `OAuth` = actor 'oauth', `Errors` = actor 'error'. Store
      filter state in component state (not persisted).
    refs:
      - specs/chat/debug/design.md
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo

  - task: >
      Test DebugPanel presentation: (1) step-start events trigger a step separator
      header, (2) outgoing events show → prefix, incoming events show ← prefix,
      (3) events with durationMs show formatted duration badge, (4) each event has
      a left border matching its actor colour, (5) tool-result events indented under
      matching tool-call, (6) quick filters toggle event visibility correctly,
      (7) all filters enabled by default, (8) disabling all filters shows no events,
      (9) auto-scroll and expand/collapse still work, (10) Clear and Download still work.
    refs:
      - specs/chat/debug/requirements.md
    priority: medium
    status: todo
