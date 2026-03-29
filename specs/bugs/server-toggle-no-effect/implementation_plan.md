id: bugs__server-toggle-no-effect
overview: >
  Fix the stale ref in client/src/App.tsx that prevents the server toggle checkbox
  from visually updating. The activeConversationRef is only refreshed when
  activeConversationId changes, but not when the conversations array itself changes
  (e.g. after handleToggleServer updates enabledServers). This causes enabledServers
  and disabledServers derivations to read stale data, so the checkbox re-renders
  with the old value.
status: done
acceptance_criteria:
  - Clicking the checkbox of a connected server unchecks it immediately in the UI; clicking again re-checks it
  - The updated enabledServers array is persisted to localStorage via the existing saveConversations call after each toggle
  - Tools from unchecked servers are included in the disabledServers list sent to the backend in chat requests
  - Disconnected servers remain greyed out and non-interactive (no regression)
  - Switching to another conversation and back preserves each conversation's independent enabledServers selection
tasks:
  - task: >
      Fix the stale ref guard in client/src/App.tsx (lines 56-62). Currently the
      activeConversationRef is only updated when activeConversationId changes:

          if (activeConversationRef.current?.id !== activeConversationId) {
            activeConversationRef.current =
              conversations.find((c) => c.id === activeConversationId) ?? null;
          }
          const activeConversation = activeConversationRef.current;

      Change the guard so the ref is ALSO refreshed when the conversations array
      changes. The simplest correct fix is to always re-derive activeConversation
      from conversations state instead of gating on id-only:

          activeConversationRef.current =
            conversations.find((c) => c.id === activeConversationId) ?? null;
          const activeConversation = activeConversationRef.current;

      This ensures that after handleToggleServer calls setConversations with
      updated enabledServers, the next render reads the fresh conversation object.
      The ref still exists for any imperative code that needs it, but its value
      is now always in sync with state.

      Verify that the enabledServers derivation on line 133-134 and the
      disabledServers derivation on line 136-138 now correctly reflect the
      updated conversations state without any additional changes.
    refs:
      - specs/bugs/server-toggle-no-effect/research.md
      - specs/bugs/server-toggle-no-effect/requirements.md
    priority: high
    status: todo

  - task: >
      Add or update tests for the server toggle flow. Test file:
      client/src/__tests__/App.serverToggle.test.tsx (or the existing App test
      file if one exists — check client/src/__tests__/ or client/src/App.test.tsx).

      Test cases:

      1. **Toggle off**: Render App with a connected server whose id is in
         enabledServers. Simulate clicking its checkbox. Assert the checkbox
         becomes unchecked AND the conversation's enabledServers in state no
         longer includes that server id.

      2. **Toggle on**: Start with a server toggled off (not in enabledServers).
         Click checkbox. Assert it becomes checked and server id is added back
         to enabledServers.

      3. **Persistence**: After toggling, assert that saveConversations was
         called (or localStorage was updated) with the conversation containing
         the correct enabledServers array.

      4. **Conversation switch preserves state**: Toggle server off in
         conversation A. Switch to conversation B (server should be enabled
         by default or per B's own enabledServers). Switch back to A. Assert
         the server is still toggled off in A.

      5. **Disconnected servers untouched**: A disconnected server's checkbox
         should be disabled and not respond to clicks — assert no state change
         when attempting to toggle a disconnected server.

      Use React Testing Library (@testing-library/react) and follow the
      existing test patterns in the client/src directory. Mock the server
      list and conversations as needed. If no existing test infrastructure
      exists for App.tsx, set up minimal mocks for useChat and fetch calls.
    refs:
      - specs/bugs/server-toggle-no-effect/requirements.md
      - specs/bugs/server-toggle-no-effect/research.md
    priority: high
    status: todo

  - task: >
      Manual smoke test checklist (verify before closing):
      1. Load app with at least one connected MCP server.
      2. Click checkbox next to connected server — it unchecks immediately.
      3. Click again — it re-checks.
      4. Send a chat message with a server unchecked — confirm the server's
         tools are suppressed (error returned for those tools).
      5. Switch conversations and switch back — toggle state preserved.
      6. Refresh page — toggle state persisted from localStorage.
      7. Disconnected servers remain greyed out and non-clickable.
    refs:
      - specs/bugs/server-toggle-no-effect/requirements.md
    priority: low
    status: todo
