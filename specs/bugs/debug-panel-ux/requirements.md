# Fix Requirements

## Acceptance Criteria

### Scroll fix
- Expanding one or more log entries does not prevent the debug panel event list from
  scrolling vertically.
- The event list scroll container must be properly constrained (e.g., `min-h-0` on the
  flex child, or a fixed/calculated height) so `overflow-y-auto` works correctly.
- The user can scroll down to see the full expanded payload of any entry.

### Expand/collapse indicator
- Every `EventEntry` that has a non-empty `payload` renders a small triangle/caret icon
  (▶ collapsed, ▼ expanded) at the start of the entry row.
- Entries without a payload show no icon and are not styled as clickable.
- The icon rotates/changes on click (CSS transition is fine).

### Payload styling (terminal/code-block)
- Expanded payload content is rendered in a visually distinct block:
  - Monospace font (`font-mono`).
  - Background clearly distinct from the entry row (e.g., `bg-neutral-950` or `bg-black`).
  - A left-accent border in the actor's colour (matching the entry's `border-l` colour).
  - Text colour lighter than the surrounding dim neutral text (e.g., `text-neutral-200`).
- If the payload is valid JSON, it is pretty-printed with 2-space indentation.
- The block has a maximum height with its own vertical scroll so a single very large
  payload cannot consume the entire panel.

## Non-Goals
- Syntax highlighting / colourisation of JSON keys vs values.
- Changing the debug panel resize or filter functionality.
- Modifying the auto-scroll-to-bottom behaviour (already handled separately by the panel).
