id: chat__chat_options
overview: >
  Rename (modal dialog) and delete (immediate) actions for conversations via
  per-item meatball menu; conversation isolation fix via key-based remount;
  isUserRenamed flag to skip auto-titling. All changes client-side.
status: done
tasks:
  # --- HIGH PRIORITY: Data model and conversation isolation ---

  - task: >
      Add `isUserRenamed?: boolean` field to the `Conversation` interface in
      `client/src/lib/types.ts`. The field is optional and defaults to `false`
      when absent, so existing localStorage entries without it require no migration.
    refs:
      - specs/chat/chat_options/design.md
    priority: high
    status: done

  - task: >
      Fix conversation isolation in `App.tsx` by adding `key={activeConversation.id}`
      to the `<Chat>` component. This forces React to unmount/remount `<Chat>` on
      every conversation switch, reinitialising `useChat` with the correct
      `initialMessages`. The Vercel AI SDK aborts any in-flight request during cleanup.
    refs:
      - specs/chat/chat_options/design.md
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
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
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
      - specs/chat/chat_options/requirements.md
    priority: high
    status: done

  # --- HIGH PRIORITY: Delete handler ---

  - task: >
      Implement `deleteConversation(id: string)` in `App.tsx`. Remove the conversation
      from state and localStorage atomically (call `saveConversations` inside the
      `setConversations` updater). If the deleted conversation was active, switch
      `activeConversationId` to the most recently created remaining conversation's id
      (first in the array), or `null` if none remain. Persist the new active id via
      `saveActiveId`.
    refs:
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
    priority: high
    status: done

  - task: >
      Test deleteConversation: (1) deleting a non-active conversation removes it from
      state and localStorage without changing activeConversationId; (2) deleting the
      active conversation switches to the most recent remaining conversation; (3) deleting
      the last conversation sets activeConversationId to null (empty state); (4) localStorage
      is updated atomically before React state settles.
    refs:
      - specs/chat/chat_options/requirements.md
    priority: high
    status: done

  # --- HIGH PRIORITY: Rename handler ---

  - task: >
      Implement `renameConversation(id: string, newTitle: string)` in `App.tsx`.
      Update the conversation's `title` to `newTitle` and set `isUserRenamed: true`.
      Persist via `saveConversations` inside the `setConversations` updater.
      If `newTitle` is empty after trimming, do not save — the caller (ConversationItem)
      is responsible for preventing empty renames.
    refs:
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
    priority: high
    status: done

  - task: >
      Test renameConversation: (1) renaming sets the new title and isUserRenamed to true;
      (2) after rename, handleMessagesChange no longer auto-titles that conversation;
      (3) renaming with empty string does not persist (title unchanged);
      (4) localStorage is updated with the new title.
    refs:
      - specs/chat/chat_options/requirements.md
    priority: high
    status: done

  # --- MEDIUM PRIORITY: ConversationItem component with meatball menu ---

  - task: >
      Create `ConversationItem` component in `client/src/components/ConversationItem.tsx`.
      Props: `conversation: Conversation`, `isActive: boolean`,
      `onSelect: (id: string) => void`, `onRename: (id: string, newTitle: string) => void`,
      `onDelete: (id: string) => void`. The component manages local state:
      (a) `isHovered` — shows/hides the meatball button on mouse enter/leave;
      (b) `menuOpen` — toggles the meatball dropdown;
      (c) `renaming` — toggles the rename modal;
      (d) `draftTitle` — text input value for the rename modal.
      Clicking the item (outside the meatball button) calls `onSelect(conversation.id)`.
    refs:
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
    priority: medium
    status: done

  - task: >
      Implement the meatball menu in `ConversationItem` as a portal dropdown. Render a
      trigger `<button>` with text "⋯" and `aria-label="Conversation options"`, visible
      only on hover. When clicked, capture trigger position via `getBoundingClientRect()`,
      set `menuOpen = true`. Render the dropdown via `ReactDOM.createPortal` into
      `document.body` with `position: fixed`, `top: triggerRect.bottom`,
      `left: triggerRect.left`, `zIndex: 9999`. The dropdown has `role="menu"` and
      contains two `role="menuitem"` buttons: "Rename" (sets `renaming = true`,
      seeds `draftTitle` with current title, closes menu) and "Delete" (calls
      `onDelete(id)`, closes menu). Register a document-level `mousedown` listener
      in a `useEffect` that closes the menu when the target is outside the menu ref.
      Close on Escape keydown as well. Only one menu open at a time.
    refs:
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
      - specs/architecture.md
    priority: medium
    status: done

  - task: >
      Implement the rename modal in `ConversationItem` as a portal overlay. When
      `renaming` is true, render via `ReactDOM.createPortal` into `document.body`:
      (1) a semi-transparent backdrop (`rgba(0,0,0,0.4)`, `position: fixed`, `inset: 0`,
      `zIndex: 9998`) that cancels on `mouseDown`; (2) a centered dialog (`position: fixed`,
      `top: 50%`, `left: 50%`, `transform: translate(-50%,-50%)`, `zIndex: 9999`) with
      `role="dialog"`, `aria-modal="true"`, `aria-label="Rename conversation"`. The dialog
      contains: an `<input>` pre-filled with `draftTitle` and `autoFocus`, a "Save" button,
      and a "Cancel" button. Save (click or Enter): if `draftTitle.trim()` is non-empty,
      call `onRename(id, draftTitle.trim())` and close; if empty, keep modal open (no-op).
      Cancel (click, Escape, or backdrop mouseDown): close modal, reset `draftTitle`.
      Focus moves to the input when the modal opens.
    refs:
      - specs/chat/chat_options/design.md
      - specs/chat/chat_options/requirements.md
    priority: medium
    status: done

  - task: >
      Wire `ConversationItem` into `App.tsx`: replace the existing inline `<button>`
      rendering in the sidebar conversation list (`conversations.map(...)`) with
      `<ConversationItem>` components. Pass `onSelect={switchConversation}`,
      `onRename={renameConversation}`, `onDelete={deleteConversation}`,
      `isActive={conv.id === activeConversationId}`, and `conversation={conv}` props.
    refs:
      - specs/chat/chat_options/design.md
    priority: medium
    status: done

  - task: >
      Test ConversationItem: (1) renders title, calls onSelect on click; (2) meatball
      button visible on hover, hidden otherwise; (3) clicking Rename opens a modal dialog
      with input pre-filled with current title; (4) Save on non-empty input calls onRename,
      Cancel/Escape closes modal without calling onRename; (5) empty input on Save does not
      call onRename (modal stays open or no-op); (6) clicking Delete calls onDelete
      immediately; (7) meatball menu closes on outside mousedown and Escape; (8) meatball
      menu and rename modal render via portal (not clipped by sidebar overflow);
      (9) accessibility: trigger has aria-label="Conversation options", menu has role="menu",
      items have role="menuitem", modal has role="dialog" and aria-modal="true".
    refs:
      - specs/chat/chat_options/requirements.md
    priority: medium
    status: done
