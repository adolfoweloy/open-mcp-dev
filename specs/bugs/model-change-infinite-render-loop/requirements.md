# Fix Requirements

## Acceptance Criteria
- Clicking "New Chat" creates a new conversation without errors or flickering
- Switching to an existing conversation renders it correctly without errors or flickering
- Rapidly switching between multiple conversations does not trigger render loops
- Changing the selected model and then switching/creating conversations works without errors
- Existing conversation titles and messages are preserved when switching between them
- The `useEffect` in `Chat.tsx` that syncs messages to parent state does not trigger an infinite update cycle under any conversation navigation sequence
- The `activeConversation` derivation in `App.tsx` does not produce new object references unless the conversation data actually changed (stable references)

## Non-Goals
- Refactoring the overall conversation state management architecture beyond what's needed to break the render loop
- Adding automated tests for React render cycles (manual verification is acceptable)
