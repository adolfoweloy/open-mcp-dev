# Fix Requirements

## Acceptance Criteria
- Clicking the checkbox of a connected server unchecks it; clicking again re-checks it.
- The updated `enabledServers` list is persisted to localStorage (existing `saveConversations`
  call must fire with the correct new array).
- Unchecked servers are NOT included in the `disabledServers` list passed to the chat
  send logic (i.e., tools from unchecked servers are suppressed).
- Disconnected servers remain visually disabled (greyed out, non-interactive) — no change.
- Switching to another conversation and switching back preserves each conversation's
  independent `enabledServers` selection.

## Non-Goals
- Changing the sidebar visual design.
- Adding a "select all / deselect all" control.
