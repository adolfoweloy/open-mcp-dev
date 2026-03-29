# Bug: Chat auto-scroll prevents manual scrolling during generation

## Description
While a response is being generated, the chat auto-scroll fires on every message update
via `scrollIntoView` unconditionally. This forces the user back to the bottom even if
they have manually scrolled up to review earlier content.

## Symptoms
- Scrolling up mid-generation snaps back to the bottom immediately on the next token chunk.
- There is no way to read earlier messages while the assistant is still responding.

## Reproduction Steps
1. Start a conversation and send a prompt that produces a long streamed response.
2. While the response is streaming, scroll up in the message list.
3. Observe that the view is immediately pulled back to the bottom on the next update.

## Expected Behaviour
- Once the user scrolls up, auto-scroll stops following the tail.
- Auto-scroll resumes automatically when the user scrolls back to within ~100px of the bottom.

## Actual Behaviour
`useEffect(() => { bottomRef.current?.scrollIntoView(...) }, [messages])` fires on every
message change with no user-scroll detection, overriding manual scroll position.

## Area Affected
`client/src/components/MessageList.tsx` — auto-scroll logic in the `useEffect` hook.
