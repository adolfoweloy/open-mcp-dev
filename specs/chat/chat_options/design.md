# Design

## Data Model

### `Conversation` type (`client/src/lib/types.ts`)

Add `isUserRenamed` field if not already present:

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

### `App.tsx` — handlers

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

### Conversation isolation

Pass `key={activeConversation.id}` to `<Chat>` in `App.tsx`:

```tsx
<Chat
  key={activeConversation.id}
  conversation={activeConversation}
  ...
/>
```

Forces React to unmount and remount `<Chat>` on every conversation switch, reinitialising
`useChat` with `initialMessages` from the new conversation. The Vercel AI SDK aborts any
in-flight request in the cleanup effect.

### `handleMessagesChange` guard

```ts
const handleMessagesChange = useCallback((messages: UIMessage[]) => {
  if (!activeConversationId) return;
  setConversations((prev) => {
    const target = prev.find((c) => c.id === activeConversationId);
    if (!target) return prev;  // conversation was deleted — discard update
    if (target.isUserRenamed) {
      const updated = prev.map((c) =>
        c.id === activeConversationId ? { ...c, messages } : c
      );
      saveConversations(updated);
      return updated;
    }
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

New component (e.g. `client/src/components/ConversationItem.tsx`). Manages:

- Hover state to show/hide the meatball button
- `menuOpen` local state for the meatball dropdown
- `renaming` local state (`boolean`) to control the rename modal

**Meatball menu (portal):**

```tsx
{menuOpen && createPortal(
  <div
    role="menu"
    ref={menuRef}
    style={{ position: "fixed", top: triggerRect.bottom, left: triggerRect.left, zIndex: 9999 }}
  >
    <button role="menuitem" onClick={handleRenameClick}>Rename</button>
    <button role="menuitem" onClick={handleDelete}>Delete</button>
  </div>,
  document.body
)}
```

`triggerRect` is captured via `getBoundingClientRect()` on the meatball button ref when
the menu opens. A document-level `mousedown` listener (registered in a `useEffect`) closes
the menu when the click target is outside `menuRef`. Uses `mousedown` (not `click`) to fire
before sibling `onClick` handlers.

**Rename modal (portal):**

```tsx
{renaming && createPortal(
  <>
    {/* backdrop */}
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998 }}
      onMouseDown={handleCancelRename}
    />
    {/* dialog */}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rename conversation"
      style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 9999 }}
    >
      <input
        ref={inputRef}
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onKeyDown={handleModalKeyDown}
        autoFocus
      />
      <button onClick={handleSaveRename}>Save</button>
      <button onClick={handleCancelRename}>Cancel</button>
    </div>
  </>,
  document.body
)}
```

**Rename flow:**
1. User clicks "Rename" in the meatball menu → menu closes, `renaming = true`, `draftTitle` seeded with current title
2. Modal opens with input focused
3. Save / Enter → if `draftTitle.trim()` is non-empty, call `onRename(id, draftTitle.trim())`, `renaming = false`; else no-op
4. Cancel / Escape / backdrop click → `renaming = false`, `draftTitle` reset

## Key Decisions

| Decision | Choice | Alternative considered |
|---|---|---|
| Rename UX | Modal dialog | Inline edit — modal is more discoverable and avoids layout shifts in the sidebar |
| Conversation isolation | `key={id}` on `<Chat>` — force remount | Resetting `useChat` via `setMessages` — not supported by SDK |
| Auto-title guard | `isUserRenamed` boolean on `Conversation` | Separate `userTitle` / `autoTitle` fields — over-engineered |
| Dropdown & modal rendering | `ReactDOM.createPortal` into `document.body` | Change sidebar `overflow` — fragile, risks layout regressions |
| Delete confirmation | None — immediate delete | Confirmation dialog — unnecessary friction for local app |
| Mid-stream switch | Stream aborted, partial response lost | Persist partial before switching — complex, not worth it |
