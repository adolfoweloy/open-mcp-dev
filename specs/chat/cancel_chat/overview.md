# chat / cancel_chat

## Purpose

Allow users to cancel an in-progress LLM streaming response. The Send button becomes a Stop button while streaming; clicking it halts the stream, preserves the partial response, and appends a "Generation interrupted" notice. Network/server errors show a distinct error message via the existing error path.

## Key Design Decisions

- **`useChat.stop()` for cancellation** — the Vercel AI SDK already exposes `stop()`, which calls `AbortController.abort()` on the underlying fetch. No backend changes required.
- **`isLoading` as the streaming gate** — consistent with existing code in `Chat.tsx`; true for both "submitted" and "streaming" states.
- **`isCancelling` local state in `Chat.tsx`** — gates the Stop button against double-clicks (debounce) and drives the button label independently of `isLoading` to avoid flicker.
- **Synthetic message via `setMessages` + `useRef` snapshot** — after `stop()`, immediately call `setMessages([...latestMessages, interruptedMsg])` using the ref-mirrored messages array (same pattern as `appendRef` already used in `Chat.tsx`). Avoids race conditions from stale closure.
- **Cancel vs error discriminant** — `error === null` after stop = user cancel → "Generation interrupted"; `error !== null` = network/server error → existing error message path (no changes needed there).
- **Server-side resource leak accepted** — `streamText` does not receive `abortSignal`, so in-flight LLM API calls for the cancelled step may complete server-side. Acceptable for a single-user local app; documented as a known limitation.

## Non-Goals

- Stopping mid-stream tool calls server-side (no `abortSignal` plumbing to `streamText`).
- A distinct visual style for the Stop button (same appearance as Send, just relabelled).
- Persisting cancelled/interrupted messages differently from normal messages.

## References

- Requirements: [requirements.md](requirements.md)
