id: chat__chatmanagement
overview: >
  Fix conversation isolation (shared message store bug) and add rename/delete
  actions via per-item meatball menu in the sidebar. All changes are client-side.
status: todo
tasks:
  # --- HIGH PRIORITY: Core isolation fix and data model ---

  - task: >
      Add `isUserRenamed?: boolean` field to the `Conversation` interface in
      `client/src/lib/types.ts`. The field is optional and defaults to `false`
      when absent, so existing localStorage entries without it require no migration.
    refs:
      - specs/chat/chatmanagement/design.md
    priority: high
    status: done

  - task: >
      Fix conversation isolation in `App.tsx` by adding `key={activeConversation.id}`
      to the `<Chat>` component. This forces React to unmount/remount `<Chat>` on
      every conversation switch, reinitialising `useChat` with the correct
      `initialMessages`. The Vercel AI SDK aborts any in-flight request during cleanup.
    refs:
      - specs/chat/chatmanagement/design.md
    priority: high
    status: done

  - task: >
      Update `handleMessagesChange` in `App.tsx` to guard against deleted conversations
      and respect `isUserRenamed`. Specifically: (1) if the conversation id no longer
      exists in the list, return `prev` unchanged (discard stale callback); (2) if
      `target.isUserRenamed` is truthy, update only the messages array and skip
      auto-title derivation; (3) otherwise, continue existing auto-title logic.
      Persist via `saveConversations` in all paths.
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  - task: >
      Test conversation isolation and handleMessagesChange guards: (1) switching
      conversations renders only the target conversation's messages (no bleed);
      (2) creating a new conversation starts with an empty message list;
      (3) a stale onMessagesChange for a deleted conversation is silently ignored;
      (4) when isUserRenamed is true, auto-title does not overwrite the user-set title;
      (5) when isUserRenamed is false/absent, auto-title still derives from first user message.
    refs:
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  # --- HIGH PRIORITY: Delete handler ---

  - task: >
      Implement `deleteConversation(id: string)` in `App.tsx`. Remove the conversation
      from state and localStorage atomically (call `saveConversations` inside the
      `setConversations` updater). If the deleted conversation was active, switch
      `activeConversationId` to the most recently created remaining conversation's id,
      or `null` if none remain. Persist the new active id via `saveActiveId`.
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  - task: >
      Test deleteConversation: (1) deleting a non-active conversation removes it from
      state and localStorage without changing activeConversationId; (2) deleting the
      active conversation switches to the most recent remaining conversation; (3) deleting
      the last conversation sets activeConversationId to null (empty state); (4) localStorage
      is updated atomically before React state settles.
    refs:
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  # --- HIGH PRIORITY: Rename handler ---

  - task: >
      Implement `renameConversation(id: string, newTitle: string)` in `App.tsx`.
      Update the conversation's `title` to `newTitle` and set `isUserRenamed: true`.
      Persist via `saveConversations` inside the `setConversations` updater.
      If `newTitle` is empty after trimming, do not save — the caller (ConversationItem)
      is responsible for reverting to the previous title on empty input.
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  - task: >
      Test renameConversation: (1) renaming sets the new title and isUserRenamed to true;
      (2) after rename, handleMessagesChange no longer auto-titles that conversation;
      (3) renaming with empty string does not persist (title unchanged);
      (4) localStorage is updated with the new title.
    refs:
      - specs/chat/chatmanagement/requirements.md
    priority: high
    status: done

  # --- MEDIUM PRIORITY: ConversationItem component ---

  - task: >
      Create `ConversationItem` component (in `client/src/components/ConversationItem.tsx`)
      extracted from the sidebar `<li>` in `App.tsx`. Props: `conversation: Conversation`,
      `isActive: boolean`, `onSelect: (id: string) => void`,
      `onRename: (id: string, newTitle: string) => void`,
      `onDelete: (id: string) => void`. The component manages three local states:
      (a) `isHovered` — shows/hides the meatball button on mouse enter/leave;
      (b) `isRenaming` — toggles inline edit mode;
      (c) `menuOpen` — toggles the meatball dropdown.
      Clicking the item (outside the meatball button) calls `onSelect(conversation.id)`.
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
    priority: medium
    status: done

  - task: >
      Implement inline rename in `ConversationItem`: when `isRenaming` is true, replace
      the title text with an `<input>` pre-filled with the current title, auto-focused.
      On Enter: trim input; if non-empty call `onRename(id, trimmedValue)` and set
      `isRenaming = false`; if empty, revert to previous title and set `isRenaming = false`.
      On Escape: set `isRenaming = false` (no change). On blur: same as Escape (cancel).
      The input should stop click propagation so it doesn't trigger `onSelect`.
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
    priority: medium
    status: done

  - task: >
      Implement the meatball menu in `ConversationItem` as a portal dropdown. Render a
      trigger `<button>` with text "⋯" visible on hover. When clicked, capture trigger
      position via `getBoundingClientRect()`, set `menuOpen = true`. Render the dropdown
      via `ReactDOM.createPortal` into `document.body` with `position: fixed`,
      `top: triggerRect.bottom`, `left: triggerRect.left`, `zIndex: 9999`. The dropdown
      contains two buttons: "Rename" (sets `isRenaming = true`, closes menu) and "Delete"
      (calls `onDelete(id)`, closes menu). Register a document-level `mousedown` listener
      in a `useEffect` that closes the menu when the target is outside the menu ref.
      Close on Escape keydown as well. Only one menu open at a time (closing is handled
      per-instance via state).
    refs:
      - specs/chat/chatmanagement/design.md
      - specs/chat/chatmanagement/requirements.md
      - specs/architecture.md
    priority: medium
    status: done

  - task: >
      Add accessibility attributes to ConversationItem: meatball trigger button gets
      `aria-label="Conversation options"`; dropdown div gets `role="menu"`; each menu
      action button gets `role="menuitem"`. On menu open, move focus into the first
      menu item. On close (Escape or outside click), return focus to the trigger button.
    refs:
      - specs/chat/chatmanagement/requirements.md
    priority: medium
    status: done

  - task: >
      Wire `ConversationItem` into `App.tsx`: replace the existing inline `<button>`
      rendering in the sidebar conversation list with `<ConversationItem>` components.
      Pass `onSelect`, `onRename={renameConversation}`, `onDelete={deleteConversation}`,
      `isActive`, and `conversation` props.
    refs:
      - specs/chat/chatmanagement/design.md
    priority: medium
    status: done

  - task: >
      Test ConversationItem: (1) renders title, calls onSelect on click; (2) meatball
      button visible on hover, hidden otherwise; (3) clicking Rename enters inline edit
      mode with pre-filled input; (4) Enter on non-empty input calls onRename, Escape
      cancels; (5) empty input on Enter reverts without calling onRename; (6) clicking
      Delete calls onDelete; (7) menu closes on outside mousedown and Escape; (8) menu
      renders via portal (not clipped by sidebar overflow); (9) accessibility: trigger
      has aria-label, menu has role="menu", items have role="menuitem".
    refs:
      - specs/chat/chatmanagement/requirements.md
    priority: medium
    status: done
