# Design: Fix infinite render loop on conversation switch

## Root Cause

The infinite render loop is caused by an unstable object reference cycle between `App.tsx` and `Chat.tsx`:

1. **Conversation switch** changes `activeConversationId`
2. **`activeConversation`** (line 26-27 in App.tsx) is derived via `conversations.find()` — this always returns whatever object is currently in the `conversations` array
3. **`Chat`** receives the new `conversation` prop → `useChat` reinitialises from `initialMessages` → `messages` state changes (new array reference)
4. **`useEffect`** (line 64-66 in Chat.tsx) fires `onMessagesChange(messages)`
5. **`handleMessagesChange`** (App.tsx line 47-69) calls `setConversations` with `.map()` + spread (`{ ...c, messages, title }`) → creates a **new array with new object references**
6. **`conversations` state changes** → `find()` returns the **new object** for the same conversation → new `activeConversation` reference → Chat gets new prop → back to step 3

The cycle repeats indefinitely because every iteration produces fresh object references.

## Proposed Fix

### Fix 1: Stabilise `activeConversation` in App.tsx (primary fix)

Replace the inline `conversations.find()` derivation with a ref-guarded lookup that only produces a new reference when `activeConversationId` actually changes:

```tsx
const activeConversationRef = useRef<Conversation | null>(null);

if (activeConversationRef.current?.id !== activeConversationId) {
  activeConversationRef.current =
    conversations.find((c) => c.id === activeConversationId) ?? null;
}
const activeConversation = activeConversationRef.current;
```

**Why this works**: After the initial lookup, subsequent renders with the same `activeConversationId` reuse the existing ref. Even when `handleMessagesChange` updates the `conversations` array (step 5-6 above), the `activeConversation` prop passed to Chat remains the same object reference. Since `useChat` already manages its own messages internally, the conversation prop is only meaningful for `initialMessages` on mount/switch — it doesn't need to track ongoing message changes.

**Edge cases handled**:
- Switching away and back to the same conversation: the ID comparison detects the change (`ref.id` is the previous conversation's ID), so `find()` runs and picks up the latest state from `conversations`.
- Creating a new conversation: `activeConversationId` changes, triggering a fresh lookup.

### Fix 2: Guard messages sync in Chat.tsx (defensive)

Add a shallow equality check in the `useEffect` that calls `onMessagesChange`, so it skips when `useChat` reinitialises with the same messages content:

```tsx
const prevMessagesRef = useRef<UIMessage[]>([]);

useEffect(() => {
  const prev = prevMessagesRef.current;
  if (
    messages.length === prev.length &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.id === prev[prev.length - 1]?.id)
  ) {
    return;
  }
  prevMessagesRef.current = messages as UIMessage[];
  onMessagesChange(messages as UIMessage[]);
}, [messages, onMessagesChange]);
```

This is belt-and-suspenders: Fix 1 already breaks the cycle, but this prevents wasteful `setConversations` calls when messages haven't meaningfully changed.

## Files to Change

| File | Change |
|------|--------|
| `client/src/App.tsx` | Replace `activeConversation` derivation with ref-guarded lookup; add `useRef` import |
| `client/src/components/Chat.tsx` | Guard messages sync `useEffect` with shallow equality check via `useRef` |

## Test Strategy

- **Manual verification** (per non-goals in requirements): click "New Chat", switch conversations rapidly, change model then switch — confirm no flickering or errors
- **Existing tests**: run `client/src/App.test.tsx` and `client/src/components/Chat.test.tsx` to confirm no regressions
- Requirements explicitly state: "Adding automated tests for React render cycles (manual verification is acceptable)" — no new render-cycle tests needed
