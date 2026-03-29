id: bugs__debug-panel-ux
overview: Fix debug panel scroll breakage on expand, add expand/collapse triangle indicators, and restyle expanded payloads with terminal/code-block appearance
status: planning
acceptance_criteria:
  - Expanding any number of log entries in the debug panel does not prevent the event list from scrolling vertically; the user can scroll to see all expanded content
  - The event list scroll container is properly constrained with min-h-0 on the flex child so overflow-y-auto functions correctly within the flex-col layout
  - Every EventEntry with a non-empty payload renders a triangle indicator (▶ when collapsed, ▼ when expanded) at the start of the entry row; entries without a payload show no indicator and no pointer cursor
  - Expanded payload blocks render with monospace font, bg-neutral-950 background, left-accent border matching the actor's colour from ACTOR_BORDER_COLORS, and text-neutral-200 text colour
  - Valid JSON payloads are pretty-printed with 2-space indentation
  - Each expanded payload block has a max-height with its own overflow-y-auto so a single large payload cannot consume the entire panel
tasks:
  - task: >
      Fix scroll breakage in client/src/components/DebugPanel.tsx.
      On the event list scroll container div (currently at ~line 258, the one with className
      "flex-1 overflow-y-auto pl-3 pr-2"), add `min-h-0` to its Tailwind classes. This is
      needed because in a CSS flex-col container, flex children default to min-height: min-content,
      which prevents overflow-y-auto from activating when expanded entries grow tall.
      Change: `"flex-1 overflow-y-auto pl-3 pr-2"` → `"flex-1 min-h-0 overflow-y-auto pl-3 pr-2"`.
      No other structural changes needed — the parent flex-col with overflow-hidden and this
      fix are sufficient.
    refs: [specs/bugs/debug-panel-ux/requirements.md, specs/bugs/debug-panel-ux/research.md]
    priority: high
    status: todo
  - task: >
      Add expand/collapse triangle indicator to EventEntry in client/src/components/DebugPanel.tsx.
      In the EventEntry component (~line 57-92), modify the entry row to:
      1. Only apply `cursor-pointer` and the `onClick` handler when `event.payload` is truthy.
         If no payload, do not set cursor-pointer or onClick.
      2. At the start of the entry row content (before the timestamp), add a small triangle
         indicator span that is only rendered when `event.payload` is truthy:
         - Collapsed: render `▶` character
         - Expanded: render `▼` character
         - Style: `className="text-neutral-500 text-[10px] mr-1 inline-block w-3"` to give
           consistent width alignment. Use a CSS transition on transform if desired, but a
           simple character swap is acceptable.
      3. For entries without payload, add a spacer `<span className="inline-block w-3 mr-1" />`
         to keep alignment consistent with entries that have the triangle.
    refs: [specs/bugs/debug-panel-ux/requirements.md, specs/bugs/debug-panel-ux/research.md]
    priority: high
    status: todo
  - task: >
      Restyle expanded payload block in EventEntry in client/src/components/DebugPanel.tsx.
      Replace the current payload `<pre>` (currently ~lines 85-89 with classes
      "mt-1 ml-2 text-[10px] text-neutral-400 whitespace-pre-wrap break-all bg-neutral-900 p-2 rounded")
      with improved styling:
      1. New className for the <pre>:
         Apply the ACTOR_BORDER_COLORS value directly (e.g. "border-l-blue-400") which sets
         both border-left-width and colour in Tailwind.
         Final className: `"mt-1 ml-2 text-[10px] text-neutral-200 whitespace-pre-wrap break-all bg-neutral-950 p-2 rounded max-h-64 overflow-y-auto font-mono " + borderClass`
         where borderClass comes from the existing ACTOR_BORDER_COLORS[event.actor] lookup.
      2. For the payload content: attempt `JSON.parse(event.payload)` in a try/catch. If it
         parses successfully, display `JSON.stringify(parsed, null, 2)`. If it fails, display
         the raw `event.payload`. This pretty-printing logic can be inline in the JSX or
         extracted to a small helper const inside EventEntry.
    refs: [specs/bugs/debug-panel-ux/requirements.md, specs/bugs/debug-panel-ux/research.md]
    priority: high
    status: todo
  - task: >
      Test all three fixes in client/src/components/DebugPanel.test.tsx.
      Add or update tests for the following scenarios:
      1. Scroll container has min-h-0 class: query the event list container (the div with
         overflow-y-auto) and assert its className includes "min-h-0".
      2. Triangle indicator — entry with payload:
         - Render an EventEntry with a DebugEvent that has a non-empty payload.
         - Assert that a ▶ character is visible in the entry.
         - Click the entry, assert the character changes to ▼.
         - Assert the entry div has cursor-pointer styling.
      3. Triangle indicator — entry without payload:
         - Render an EventEntry with a DebugEvent that has no payload (undefined).
         - Assert no ▶ or ▼ character is rendered.
         - Assert the entry div does NOT have cursor-pointer styling.
      4. Payload styling:
         - Render an EventEntry with a payload, click to expand.
         - Query the <pre> element and assert it has classes: bg-neutral-950, text-neutral-200,
           max-h-64, overflow-y-auto, font-mono.
         - Assert it has the actor's border-l colour class (e.g. border-l-blue-400 for llm actor).
      5. JSON pretty-printing:
         - Render with payload '{"key":"value"}', click to expand.
         - Assert the <pre> text content is the pretty-printed version with 2-space indentation.
      6. Non-JSON payload:
         - Render with payload 'plain text content', click to expand.
         - Assert the <pre> text content is 'plain text content' unchanged.
      7. Max-height scroll on payload:
         - Assert the expanded <pre> has max-h-64 and overflow-y-auto classes (covered by test 4).
      Use the existing test patterns from the current DebugPanel.test.tsx file. Import
      DebugEvent type from client/src/lib/types.ts. Wrap renders in necessary context providers
      (check existing tests for which providers are needed, likely DebugContext).
    refs: [specs/bugs/debug-panel-ux/requirements.md, specs/bugs/debug-panel-ux/research.md]
    priority: high
    status: todo
