# Chat Management

## Purpose and Scope

Fixes conversation isolation (each chat must have independent message state) and adds
rename and delete actions to the conversation sidebar. Scope is limited to the
client-side sidebar and `Chat` component — no server changes required.

## Key Design Decisions

- **`key={conversation.id}` on `<Chat>`** — forces remount on conversation switch,
  reinitialising `useChat` with the correct `initialMessages`. In-flight streams are
  aborted by the Vercel AI SDK's cleanup; partial responses may be lost on switch
  (acceptable for a single-user local app).
- **`isUserRenamed` flag on `Conversation`** — `handleMessagesChange` auto-titles from
  the first user message, but skips this when `isUserRenamed: true`. Existing
  localStorage entries without the field default to `false` (no migration needed).
- **Meatball menu via React portal** — the dropdown is rendered into `document.body`
  via `ReactDOM.createPortal` to escape the sidebar's `overflow: hidden` containment.
  Only one menu is open at a time; closed on `mousedown` outside or `Escape`.
- **Immediate delete, no confirmation** — deleted conversation is removed from
  `conversations` state and `localStorage` atomically; active id switches to the most
  recent remaining conversation or `null`.

## Non-Goals

- Conversation reordering (drag-and-drop)
- Search or filter across conversations
- Server-side persistence
- Bulk delete / multi-select

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
