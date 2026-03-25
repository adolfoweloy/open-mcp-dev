# Bug: Changing model triggers infinite render loop when switching/creating conversations

## Description
After changing the selected model in the UI, clicking "New Chat" or switching to an existing conversation causes a `Maximum update depth exceeded` error and continuous UI flickering, making the app unusable until a page refresh.

## Symptoms
- "Maximum update depth exceeded" error in the terminal
- UI flickers continuously — no component is interactable
- Existing conversation titles reset to "New chat" when switching to them
- Refreshing the page recovers the app, but the issue recurs on the next model change + conversation switch

## Reproduction Steps
1. Load the app (first load works normally)
2. Select a different model from the model selector
3. Click "New Chat" or switch to an existing conversation in the sidebar
4. Observe: the UI starts flickering and the terminal shows `Maximum update depth exceeded`

## Expected Behaviour
- Changing the model and then creating or switching conversations should work without errors
- The UI should remain stable and interactive

## Actual Behaviour
- An infinite render loop occurs between `Chat.tsx`'s `useEffect` (messages sync) and `App.tsx`'s `handleMessagesChange` → `setConversations` cycle
- The loop: model change updates conversation state → `Chat` receives new `conversation` prop (new object reference) → `useChat` reinitialises messages → `useEffect` fires `onMessagesChange` → `handleMessagesChange` calls `setConversations` → new `activeConversation` object reference → repeat

## Area Affected
- `client/src/App.tsx` — conversation state management, `handleMessagesChange`, model change handler
- `client/src/components/Chat.tsx` — `useEffect` messages sync (line 64-66), `useChat` hook dependency on conversation/model props
