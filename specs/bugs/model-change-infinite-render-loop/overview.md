# Bug: Infinite render loop when switching or creating conversations

## Description
Clicking "New Chat" or switching to an existing conversation in the sidebar causes a `Maximum update depth exceeded` error and continuous UI flickering, making the app unusable until a page refresh. No prior model change is required — any conversation switch or creation triggers the loop.

## Symptoms
- "Maximum update depth exceeded" error in the terminal
- UI flickers continuously — no component is interactable
- Continues until the page is reloaded
- Occurs on every New Chat click and every conversation switch

## Reproduction Steps
1. Load the app (first load works normally)
2. Click "New Chat" or switch to an existing conversation in the sidebar
3. Observe: the UI starts flickering and the terminal shows `Maximum update depth exceeded`

## Expected Behaviour
- Creating or switching conversations should work without errors or flickering
- The UI should remain stable and interactive after any conversation navigation

## Actual Behaviour
- An infinite render loop occurs between `Chat.tsx`'s `useEffect` (messages sync) and `App.tsx`'s `handleMessagesChange` → `setConversations` cycle
- The loop: conversation switch changes `activeConversationId` → `activeConversation` recalculated via `find()` producing a new object reference → `Chat` receives new `conversation` prop → `useChat` reinitialises from `initialMessages` → `messages` changes → `useEffect` fires `onMessagesChange` → `handleMessagesChange` calls `setConversations` with a new array → new `activeConversation` reference → repeat

## Area Affected
- `client/src/App.tsx` — conversation state management (`activeConversation` computed via `find()`), `handleMessagesChange` creating new array references
- `client/src/components/Chat.tsx` — `useEffect` messages sync (line 64-66), `useChat` hook reinitialising on prop changes
