# Fix Requirements

## Acceptance Criteria
- Changing the selected model and then clicking "New Chat" creates a new conversation without errors or flickering
- Changing the selected model and then switching to an existing conversation renders it correctly without errors or flickering
- Existing conversation titles are preserved when switching between them after a model change
- The `useEffect` in `Chat.tsx` that syncs messages to parent state does not trigger an infinite update cycle under any combination of model change + conversation switch
- Conversations created after a model change correctly use the newly selected model

## Non-Goals
- Refactoring the overall conversation state management architecture
- Changing how model selection works beyond fixing the render loop
- Adding automated tests for React render cycles (manual verification is acceptable)
