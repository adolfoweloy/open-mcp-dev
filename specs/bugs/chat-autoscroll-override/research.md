# Research: bugs/chat-autoscroll-override

**Tier**: light
**Generated**: 2026-03-29 16:05

---

# File Mapping

Now let me check the UIMessage type definition.## File Mapping

### MessageList.tsx — Core Auto-Scroll Component

**Finding**: `MessageList` is the sole component managing auto-scroll behavior. It contains a single `useEffect` that unconditionally calls `scrollIntoView` on every `messages` change — there is no user-scroll-position tracking.
**Location**: `client/src/components/MessageList.tsx:14-16`
**Details**:
```tsx
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
```
- `bottomRef` is a `useRef<HTMLDivElement>` attached to a sentinel `<div>` at the end of the message list (line 36, `data-testid="scroll-sentinel"`).
- The scroll container is the wrapping `<div>` with inline styles `{ overflowY: "auto", flex: 1 }` (line 27). This div has **no ref**, no `onScroll` handler, and no id/className.
- The `messages` prop is typed as `UIMessage[]` (re-exported from `shared/types`).
- Two additional optional props: `onSendMessage` and `onUpdateContext`, passed through to `MessageBubble` children.

### Chat.tsx — Parent Component

**Finding**: `Chat` is the direct parent of `MessageList`. It passes `messages` (from `useChat`), plus `handleSendMessage` and `handleUpdateContext` callbacks.
**Location**: `client/src/components/Chat.tsx:150-158`
**Details**:
- The outer container is `<div style={{ display: "flex", flexDirection: "column", height: "100%" }}>` (line 143). This is the flex parent that allows `MessageList`'s scroll container (`flex: 1`) to fill remaining vertical space.
- `Chat` does **not** set any overflow styles itself — overflow is handled entirely within `MessageList`'s root div.
- `messages` comes from `useChat` (line 29) and is cast to `UIMessage[]` at line 131 before being passed down. An optional error message is appended inline (lines 151-155).

### MessageList.test.tsx — Existing Tests

**Finding**: The test file stubs `scrollIntoView` globally in a `beforeAll` because jsdom doesn't implement it. Four tests exist: rendering message count, empty state, sentinel existence, and sentinel absence on empty.
**Location**: `client/src/components/MessageList.test.tsx:9-11`
**Details**:
```tsx
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
```
No tests currently verify scroll behavior or user-scroll-position logic.

### Files That Will Need Modification

| File | Purpose | Change Needed |
|------|---------|--------------|
| `client/src/components/MessageList.tsx` | Scroll container + auto-scroll useEffect | Add scroll container ref, `onScroll` handler, `userHasScrolledUp` state, conditional `scrollIntoView` |
| `client/src/components/MessageList.test.tsx` | Unit tests | Add tests for scroll-follow/suspend/resume behavior |

### Files That Do NOT Need Modification

| File | Reason |
|------|--------|
| `client/src/components/Chat.tsx` | No overflow styles or scroll logic; only passes `messages` prop |
| `client/src/components/MessageBubble.tsx` | Renders individual messages; not involved in scroll |
| `client/src/lib/types.ts` | No new types needed for scroll tracking (boolean + number state suffices) |

### Directory Structure & Naming Conventions

**Finding**: All components live flat under `client/src/components/` with co-located test files using the `.test.tsx` suffix. No subdirectories or barrel files.
**Location**: `client/src/components/`
**Details**: Pattern is `ComponentName.tsx` + `ComponentName.test.tsx`. No custom hooks directory exists — if a `useAutoScroll` hook were extracted, it would be a new pattern (but extraction is not required since the logic can stay inline in `MessageList`).

### Scroll Container Details

**Finding**: The scroll container is an anonymous `<div>` with inline styles. It has no ref, no id, no className, and no event handlers.
**Location**: `client/src/components/MessageList.tsx:27`
```tsx
<div style={{ overflowY: "auto", flex: 1 }}>
```
To implement scroll tracking, a `ref` and `onScroll` handler must be added to this element. The proximity check (`scrollHeight - scrollTop - clientHeight < ~100px`) will use this ref's `.current` properties.

