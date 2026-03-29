# Research: bugs/server-toggle-no-effect

**Tier**: light
**Generated**: 2026-03-29 16:43

---

# File Mapping

## File Mapping

### Core Files Involved

**Finding**: The bug involves 4 key files in a tight data flow chain.
**Details**:

| File | Purpose |
|------|---------|
| `client/src/App.tsx` | Root component; owns `conversations` state, derives `enabledServers`/`disabledServers`, defines `handleToggleServer` |
| `client/src/components/ServerSidebar.tsx` | Renders server list with checkboxes; receives `enabledServers` and `onToggle` as props |
| `client/src/lib/types.ts` | Defines `Conversation` interface (includes optional `enabledServers?: string[]`) |
| `client/src/lib/storage.ts` | `saveConversations`/`loadConversations` — persists to localStorage |
| `client/src/components/Chat.tsx` | Receives `selectedServers` and `disabledServers` props; passes them in `useChat` body |

---

### Data Flow: enabledServers from State to Checkbox

**Finding**: The `enabledServers` value flows through a stale ref, which is the root cause of the bug.

**Location**: `client/src/App.tsx:56-62` (ref definition and update), `client/src/App.tsx:133-134` (enabledServers derivation)

**Details — step by step**:

1. **State**: `conversations` is a `useState<Conversation[]>` (line 42-43).
2. **Ref caching**: `activeConversationRef` (line 56) caches the active conversation object:
   ```ts
   // line 58-61
   if (activeConversationRef.current?.id !== activeConversationId) {
     activeConversationRef.current =
       conversations.find((c) => c.id === activeConversationId) ?? null;
   }
   const activeConversation = activeConversationRef.current;
   ```
   The ref is **only refreshed when `activeConversationId` changes** — NOT when `conversations` changes.

3. **enabledServers derivation** (line 133-134):
   ```ts
   const enabledServers: string[] =
     activeConversation?.enabledServers ?? servers.filter((s) => s.connected).map((s) => s.id);
   ```
   This reads from `activeConversation`, which is the **stale ref**.

4. **handleToggleServer** (line 140-154): Updates `conversations` state with the new `enabledServers` array via `setConversations`. This triggers a re-render, BUT:
   - `activeConversationId` has NOT changed
   - So the ref guard on line 58 (`activeConversationRef.current?.id !== activeConversationId`) is **false**
   - `activeConversation` still points to the OLD object without the updated `enabledServers`
   - `enabledServers` derivation on line 133 reads the stale value
   - Checkbox re-renders with the old checked state

5. **Prop flow to ServerSidebar** (line 224-229):
   ```tsx
   <ServerSidebar
     servers={servers}
     enabledServers={enabledServers}  // stale!
     onToggle={handleToggleServer}
     onOpenSettings={() => setIsSettingsOpen(true)}
   />
   ```

6. **Checkbox binding** in `ServerSidebar.tsx` (line 24):
   ```tsx
   checked={enabledServers.includes(server.id)}
   ```
   This receives the stale `enabledServers`, so the checkbox does not visually toggle.

---

### Conversation Type Definition

**Finding**: `Conversation` already has the `enabledServers` field as optional.
**Location**: `client/src/lib/types.ts:11-17`
```ts
export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  isUserRenamed?: boolean;
  enabledServers?: string[];
}
```

---

### Persistence

**Finding**: `saveConversations` serializes the full `Conversation[]` to localStorage, which already includes `enabledServers` when present. `handleToggleServer` already calls `saveConversations` (line 152). Persistence is working correctly — the bug is purely in the render/read path.
**Location**: `client/src/lib/storage.ts:20-24`, `client/src/App.tsx:152`

---

### Chat Component Consumption

**Finding**: `Chat` receives both `selectedServers` (= `enabledServers`) and `disabledServers` as props and passes them in `useChat`'s `body` option (line 41-45). Because `enabledServers` is stale, `disabledServers` derived on line 136-138 is also stale — but this is a downstream effect of the same root cause.
**Location**: `client/src/components/Chat.tsx:37-46`, `client/src/App.tsx:136-138`

---

### Files That Need Modification

**Finding**: Only `client/src/App.tsx` needs to be modified. The fix is in how `activeConversation` is derived — the ref guard must also account for `conversations` changes, or the derivation should not use the ref at all for `enabledServers`.

**Location**: `client/src/App.tsx:56-62` — the stale ref caching logic.

No changes needed in:
- `ServerSidebar.tsx` — correctly binds `checked` to the prop it receives
- `storage.ts` — persistence already works
- `types.ts` — `enabledServers` field already exists
- `Chat.tsx` — correctly passes props to `useChat`

