# Requirements

## Functional Requirements

### Conversation Isolation

- Each conversation must maintain an independent message store
- Switching conversations must not show messages from any other conversation
- Creating a new conversation must start with an empty message list
- The `<Chat>` component must be remounted (via `key` prop) when the active
  conversation changes

### Rename Conversation

- A meatball menu button (⋯) appears on hover over each conversation item in the sidebar
- The meatball menu contains a "Rename" action
- Clicking "Rename" replaces the conversation title in the sidebar with an inline text input
  pre-filled with the current title
- Pressing Enter confirms the rename; the title is updated in state and persisted to localStorage
- Pressing Escape cancels the rename; the original title is restored
- An empty title on confirm must not be saved; revert to the previous title
- After a user confirms a rename, auto-titling from `handleMessagesChange` must not
  overwrite the user-set title for that conversation

### Delete Conversation

- The meatball menu also contains a "Delete" action
- Clicking "Delete" immediately removes the conversation from state and localStorage
- No confirmation dialog is shown
- If the deleted conversation was active, the app switches to the most recently created
  remaining conversation; if none remain, the empty state is shown
- A stale `onMessagesChange` callback for a deleted conversation must be silently ignored
  (guard: skip if the conversation id no longer exists in the list)

### Meatball Menu UX

- Only one meatball menu is open at a time
- The menu closes when the user clicks outside it (`mousedown` on `document`)
- The menu closes when `Escape` is pressed
- The menu is rendered via `ReactDOM.createPortal` into `document.body` to avoid
  clipping by the sidebar's `overflow: hidden` container
- The menu is positioned adjacent to the trigger button using `getBoundingClientRect`

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Conversation switch must not cause visible lag; remount is acceptable |
| Scalability | Existing cap of 50 conversations in localStorage is unchanged |
| Security | No new attack surface — all changes are client-side, no user input reaches the server |
| Reliability | Rename and delete must persist atomically to localStorage before updating React state |
| Observability | No additional logging required — single-user local app |
| Accessibility | Meatball trigger: `<button>` with `aria-label="Conversation options"`. Dropdown: `role="menu"`, each action `role="menuitem"`. Focus moves into the menu on open; returns to trigger on close or Escape. |
| Maintainability | `isUserRenamed` field must default to `false` when deserialising existing localStorage entries that lack it |
