id: chat__cancel_chat
overview: >
  Add stream cancellation to Chat.tsx — the Send button becomes Stop while streaming,
  clicking it aborts the stream via useChat.stop(), preserves partial output, appends a
  synthetic "Generation interrupted" assistant message, and restores the user's draft input.
status: done
acceptance_criteria:
  - While isLoading is true the submit button reads "Stop"; while isLoading is false it reads "Send"
  - Clicking Stop calls useChat.stop(), immediately appends a synthetic assistant message containing "⚠ Generation interrupted." to the message thread, and the partial response already streamed is preserved above it
  - After cancellation the text input is re-enabled and repopulated with the user message that triggered the cancelled generation
  - Double-clicking Stop within the same cancel cycle has no additional effect (isCancelling debounce)
  - A network/server error (useChat error !== null) does NOT produce a "Generation interrupted" message — the existing error rendering path is used unchanged
  - No server-side changes are required; cancellation is entirely client-side
tasks:
  - task: >
      Modify `client/src/components/Chat.tsx` to implement stream cancellation:

      1. **Add `stop` and `setMessages` to the useChat destructuring** (line 28-36). Add them
         alongside the existing `messages`, `input`, etc.

      2. **Add `isCancelling` local state**: `const [isCancelling, setIsCancelling] = useState(false);`
         placed after the existing `oauthBannerServerId` state (line 25).

      3. **Add `savedInputRef`**: `const savedInputRef = useRef("");` — stores the user's input
         text at the moment a request is submitted so it can be restored after cancel or error.
         Place near the other refs (around line 98).

      4. **Add `messagesRef`**: `const messagesRef = useRef(messages); messagesRef.current = messages;`
         — a ref mirror of the messages array (same pattern as `appendRef` at line 98-99) so the
         cancel handler avoids stale closures. Place adjacent to `appendRef`.

      5. **Save input on submit**: Wrap `handleSubmit` usage. In the `<form onSubmit={...}>` handler
         (line 160), replace the direct `handleSubmit` call with a wrapper function:
         ```ts
         const onFormSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
           savedInputRef.current = input;
           handleSubmit(e);
         }, [input, handleSubmit]);
         ```
         Use `onFormSubmit` as the form's `onSubmit` and also in `handleKeyDown` (line 127).

      6. **Implement `handleStop`**:
         ```ts
         const handleStop = useCallback(() => {
           if (isCancelling) return;
           setIsCancelling(true);
           stop();
           const current = messagesRef.current as UIMessage[];
           const interruptedMsg: UIMessage = {
             id: `interrupted-${Date.now()}`,
             role: "assistant",
             content: "",
             parts: [{ type: "text", text: "⚠ Generation interrupted." }],
           } as unknown as UIMessage;
           setMessages([...current, interruptedMsg]);
           setIsCancelling(false);
         }, [isCancelling, stop, setMessages]);
         ```

      7. **Restore input after cancel or error**: Add a `useEffect` that watches `isLoading`.
         When `isLoading` transitions from `true` to `false`, set the input back to the saved value:
         ```ts
         const wasLoadingRef = useRef(false);
         useEffect(() => {
           if (wasLoadingRef.current && !isLoading) {
             handleInputChange({ target: { value: savedInputRef.current } } as React.ChangeEvent<HTMLTextAreaElement>);
             savedInputRef.current = "";
           }
           wasLoadingRef.current = isLoading;
         }, [isLoading, handleInputChange]);
         ```

      8. **Conditional Send/Stop button**: Replace the existing button (lines 170-172) with:
         ```tsx
         {isLoading ? (
           <button type="button" onClick={handleStop} disabled={isCancelling}>
             Stop
           </button>
         ) : (
           <button type="submit" disabled={!input.trim()}>
             Send
           </button>
         )}
         ```
         The Stop button is `type="button"` so it does not trigger form submit. The Send button
         no longer needs `disabled={isLoading}` since it is only rendered when `!isLoading`.
    refs:
      - specs/chat/cancel_chat/requirements.md
      - specs/chat/cancel_chat/research.md
      - specs/architecture.md
    priority: high
    status: todo

  - task: >
      Update `client/src/components/Chat.test.tsx` to cover the cancel feature.

      1. **Update `makeDefaultUseChat`** (lines 28-39): Add `stop: vi.fn()`, `setMessages: vi.fn()`,
         and `data: undefined` to the default return object.

      2. **Test: "Shows Stop button while loading"** — render with `isLoading: true`, assert
         `screen.getByRole("button", { name: "Stop" })` is present and
         `screen.queryByRole("button", { name: "Send" })` is null.

      3. **Test: "Shows Send button when not loading"** — render with `isLoading: false`,
         assert Send button present, Stop button absent.

      4. **Test: "Clicking Stop calls stop() and setMessages with interrupted message"** —
         render with `isLoading: true` and a `messages` array containing one assistant message.
         Click the Stop button. Assert: `stop` mock called once; `setMessages` mock called once
         with an array whose last element has `parts[0].text` equal to `"⚠ Generation interrupted."`;
         the existing assistant message is preserved as the first element.

      5. **Test: "Double-click Stop is debounced"** — render with `isLoading: true`. Click Stop
         twice in rapid succession. Assert `stop` was called exactly once.

      6. **Test: "Input restored after cancel"** — render with `isLoading: false, input: "my prompt"`.
         Re-render with `isLoading: true` (simulating submit). Then re-render with `isLoading: false`.
         Assert `handleInputChange` was called with an event-like object whose `target.value` equals
         `"my prompt"`. (Note: the saved input mechanism relies on the form submit wrapper saving the
         input into `savedInputRef` before `isLoading` transitions. In the test, simulate by triggering
         form submit first, then toggling `isLoading`.)

      7. **Test: "Network error does not produce interrupted message"** — render with
         `isLoading: false, error: new Error("network")`. Assert the text "Generation interrupted"
         does NOT appear in the document; the error message "Error: network" does appear (existing
         error path).

      8. **Test: "Send button disabled when input is empty"** — render with `isLoading: false,
         input: ""`. Assert Send button is disabled. Render with `input: "hello"`, assert Send
         button is enabled.

      Use the existing test patterns: `mockUseChat.mockReturnValue(makeDefaultUseChat({...}) as
      unknown as ReturnType<typeof useChat>)`, render `<Chat>` with the standard `conversation`
      fixture, and wrap assertions in `waitFor` or `act` as needed.
    refs:
      - specs/chat/cancel_chat/requirements.md
      - specs/chat/cancel_chat/research.md
    priority: high
    status: todo
