# Design

## Data Model

### `Conversation` type (`client/src/lib/types.ts`)

Add `isUserRenamed` field:

```ts
export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  isUserRenamed?: boolean;  // defaults to false if absent (localStorage compat)
}
```

No localStorage migration needed — existing entries without the field are treated as
`isUserRenamed: false` at read time.

## Interfaces

### `App.tsx` — new handlers

```ts
function renameConversation(id: string, newTitle: string): void
function deleteConversation(id: string): void
```

### `ConversationItem` props

```ts
interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
}
```

## Component Design

### Conversation isolation fix

In `App.tsx`, pass `key={activeConversation.id}` to `<Chat>`:

```tsx
<Chat
  key={activeConversation.id}
  conversation={activeConversation}
  ...
/>
```

This causes React to unmount and remount `<Chat>` on every conversation switch,
reinitialising `useChat` with `initialMessages` from the new conversation. The Vercel AI
SDK aborts any in-flight request in the previous instance's cleanup effect.

### `handleMessagesChange` guard

```ts
const handleMessagesChange = useCallback((messages: UIMessage[]) => {
  if (!activeConversationId) return;
  setConversations((prev) => {
    const target = prev.find((c) => c.id === activeConversationId);
    if (!target) return prev;  // conversation was deleted — discard update
    if (target.isUserRenamed) {
      // preserve user title; only update messages
      const updated = prev.map((c) =>
        c.id === activeConversationId ? { ...c, messages } : c
      );
      saveConversations(updated);
      return updated;
    }
    // auto-derive title from first user message
    const title = deriveTitle(messages);
    const updated = prev.map((c) =>
      c.id === activeConversationId ? { ...c, messages, title } : c
    );
    saveConversations(updated);
    return updated;
  });
}, [activeConversationId]);
```

### `deleteConversation` handler

```ts
function deleteConversation(id: string) {
  setConversations((prev) => {
    const updated = prev.filter((c) => c.id !== id);
    saveConversations(updated);
    return updated;
  });
  setActiveConversationId((currentId) => {
    if (currentId !== id) return currentId;
    const remaining = conversations.filter((c) => c.id !== id);
    const next = remaining[0]?.id ?? null;
    saveActiveId(next);
    return next;
  });
}
```

### `ConversationItem` component

New component extracted from the sidebar `<li>` in `App.tsx`. Manages:

- Hover state to show/hide meatball button
- `isRenaming` local state (boolean) for inline edit mode
- `menuOpen` local state for the meatball dropdown

**Inline rename flow:**
1. User clicks "Rename" in the menu → `isRenaming = true`, menu closes
2. Title text replaced with `<input>` pre-filled with current title
3. `onKeyDown`: Enter → validate non-empty → call `onRename` → `isRenaming = false`
4. `onKeyDown`: Escape → `isRenaming = false` (no change)
5. `onBlur` → same as Escape (cancel)

**Meatball menu (portal):**

```tsx
// Inside ConversationItem render
{menuOpen && createPortal(
  <div
    role="menu"
    ref={menuRef}
    style={{ position: "fixed", top: triggerRect.bottom, left: triggerRect.left, zIndex: 9999 }}
  >
    <button role="menuitem" onClick={handleRename}>Rename</button>
    <button role="menuitem" onClick={handleDelete}>Delete</button>
  </div>,
  document.body
)}
```

`triggerRect` is captured via `getBoundingClientRect()` on the meatball button ref when
the menu opens.

Document-level `mousedown` listener (registered in a `useEffect`) closes the menu when
the click target is outside `menuRef`. Listener uses `mousedown` (not `click`) so it
fires before the element's `onClick`, ensuring correct sequencing when the user clicks
another conversation item.

## Key Decisions

| Decision | Choice | Alternative considered |
|---|---|---|
| Conversation isolation | `key={id}` on `<Chat>` — force remount | Resetting `useChat` via `setMessages` — not supported by SDK |
| Auto-title vs user title | `isUserRenamed` boolean flag on `Conversation` | Separate `userTitle` / `autoTitle` fields — over-engineered |
| Dropdown rendering | `ReactDOM.createPortal` into `document.body` | Change sidebar `overflow` — fragile, risks layout regressions |
| Delete confirmation | None — immediate delete | Confirmation dialog — unnecessary friction for local app |
| Mid-stream switch | Stream aborted, partial response lost | Persist partial before switching — complex, not worth it |
