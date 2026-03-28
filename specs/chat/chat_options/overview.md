# Chat Options

## Purpose and Scope

Adds rename and delete actions to conversations in the sidebar. Users access both actions
via a meatball menu (⋯) that appears on hover over each conversation item. Rename uses a
modal dialog; delete is immediate with no confirmation. Scope is entirely client-side —
no server changes required.

## Key Design Decisions

- **Meatball menu via React portal** — rendered into `document.body` via
  `ReactDOM.createPortal` to escape the sidebar's `overflow: hidden` containment. Closed
  on `mousedown` outside or `Escape`.
- **Rename modal via React portal** — a centred overlay rendered into `document.body`.
  Contains a pre-filled text input and Save / Cancel buttons. Escape and clicking the
  backdrop also cancel.
- **`isUserRenamed` flag** — once a user confirms a rename, `handleMessagesChange` skips
  auto-titling for that conversation. Existing localStorage entries without the field
  default to `false` (no migration needed).
- **`key={conversation.id}` on `<Chat>`** — forces remount on conversation switch,
  correctly initialising `useChat` with `initialMessages` from the selected conversation.
- **Immediate delete, no confirmation** — removed from state and localStorage atomically;
  active id falls back to the most recent remaining conversation or `null`.

## Non-Goals

- Conversation reordering (drag-and-drop)
- Search or filter across conversations
- Server-side persistence
- Bulk delete / multi-select
- Export or archive

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
