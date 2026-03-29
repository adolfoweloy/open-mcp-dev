# Requirements: chat / cancel_chat

## Functional Requirements

### Stop Button Visibility

- While `isLoading` is `true`, the Send button label changes to "Stop".
- While `isLoading` is `true`, the text input remains disabled (existing behaviour, unchanged).
- While `isLoading` is `false`, the button label is "Send" (existing behaviour, unchanged).

### Cancellation Flow

- Clicking "Stop" calls `useChat.stop()` to abort the in-progress stream.
- If `isCancelling` is already `true` when Stop is clicked, the click is ignored (debounce).
- After `stop()` is called, `setMessages` is called synchronously in the same handler, appending a synthetic assistant message: `"⚠ Generation interrupted."`.
- The message snapshot used for `setMessages` is taken from a `useRef` mirror of `messages` to avoid stale-closure issues.
- After the synthetic message is appended, `isCancelling` is reset to `false`.
- The partial response already streamed before cancellation is preserved in the chat thread.

### Input Restoration

- After cancellation, the text input is re-enabled (driven by `isLoading` becoming `false`).
- The input is repopulated with the original user message text that triggered the now-cancelled generation.

### Error Handling (Network / Server Error)

- If `useChat` sets a non-null `error` after `isLoading` goes false, the existing error message rendering path is used unchanged — it does NOT show "Generation interrupted".
- The input is re-enabled and the original message text is restored in the same way as a user-initiated cancel.

### Button State During Cancellation

- Once Stop is clicked (`isCancelling = true`), the button is effectively disabled against further clicks until the synthetic message is injected and `isCancelling` resets.

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | Button state toggle and message injection must complete within a single render cycle; no async delay |
| Scalability | N/A — single-user local app |
| Security | No change to security posture; `stop()` is client-side only |
| Reliability | Server-side steps in-flight at cancel time may complete (resource leak); acceptable for local use |
| Observability | No additional logging required; existing debug event pipeline is unaffected |
| Maintainability | `isCancelling` state and cancel logic live entirely in `Chat.tsx`; no new context or abstraction |
