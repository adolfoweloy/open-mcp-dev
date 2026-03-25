id: bugs__model-change-infinite-render-loop
overview: Break the infinite render loop caused by unstable activeConversation references on conversation switch/creation
status: todo
tasks:
  - task: >
      In client/src/App.tsx, stabilise the activeConversation derivation to prevent
      new object references on every render. Add useRef to the React imports. Replace
      the current inline derivation (line 26-27: `const activeConversation =
      conversations.find((c) => c.id === activeConversationId) ?? null;`) with a
      ref-guarded lookup: declare `const activeConversationRef = useRef<Conversation | null>(null);`
      then add an `if (activeConversationRef.current?.id !== activeConversationId)`
      guard that only calls `conversations.find()` and updates the ref when the ID
      has actually changed. Set `const activeConversation = activeConversationRef.current;`.
      This ensures Chat receives a stable conversation prop — the reference only changes
      when switching to a different conversation, not when handleMessagesChange updates
      the conversations array. Import type for Conversation is already present.
    refs:
      - specs/bugs/model-change-infinite-render-loop/design.md
      - specs/bugs/model-change-infinite-render-loop/requirements.md
    priority: high
    status: todo
  - task: >
      In client/src/components/Chat.tsx, guard the messages-sync useEffect (lines 64-66)
      to only call onMessagesChange when messages have meaningfully changed. Add a
      `const prevMessagesRef = useRef<UIMessage[]>([]);` at the top of the component.
      In the useEffect, before calling onMessagesChange, compare: if messages.length
      equals prevMessagesRef.current.length AND (length is 0 OR the last message ID
      matches), return early without calling onMessagesChange. Otherwise update
      prevMessagesRef.current and call onMessagesChange. useRef is already imported.
      This prevents wasteful setConversations calls when useChat reinitialises with
      identical content (e.g. on prop changes that don't affect messages).
    refs:
      - specs/bugs/model-change-infinite-render-loop/design.md
      - specs/bugs/model-change-infinite-render-loop/requirements.md
    priority: high
    status: todo
  - task: >
      Run existing test suites for client/src/App.test.tsx and
      client/src/components/Chat.test.tsx to verify no regressions. All existing
      tests must continue to pass. Per the spec's non-goals, no new automated
      render-cycle tests are needed — manual verification is acceptable.
    refs:
      - specs/bugs/model-change-infinite-render-loop/requirements.md
    priority: high
    status: todo
