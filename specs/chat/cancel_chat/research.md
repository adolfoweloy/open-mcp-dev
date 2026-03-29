# Research: chat/cancel_chat

**Tier**: light
**Generated**: 2026-03-29 20:41

---

# File Mapping

Now let me check what `useChat` from `@ai-sdk/react` exposes (specifically `stop` and `setMessages`).Now let me check the `@ai-sdk/react` useChat type definitions to confirm `stop` and `setMessages` are available.Now I have all the information needed. Let me check the shared types for the UIMessage type.Here are my complete findings:

## File Mapping

### Primary File: Chat.tsx

**Finding**: Main chat component containing all logic relevant to the cancel feature.
**Location**: `client/src/components/Chat.tsx:1-176`
**Details**: This is the only file that needs modification. It contains the Send button, form, textarea, useChat hook usage, and message management.

### useChat Hook Destructuring — Current State

**Finding**: Chat.tsx currently destructures these fields from `useChat`:
`messages`, `input`, `handleInputChange`, `handleSubmit`, `isLoading`, `error`, `append`, `data`
**Location**: `client/src/components/Chat.tsx:28-46`
**Details**: Notably **missing** from current destructuring: `stop`, `setMessages`. Both are available from `@ai-sdk/react`'s useChat return type and will need to be added.

### useChat Return Type — Available Fields

**Finding**: `@ai-sdk/react` useChat exposes `stop: () => void` and `setMessages: (messages: Message[] | ((messages: Message[]) => Message[])) => void`
**Location**: `node_modules/@ai-sdk/react/dist/index.d.ts:86,96`
**Details**: `stop()` aborts the current stream. `setMessages` accepts both direct array and updater function form.

### Send Button Rendering

**Finding**: Single `<button type="submit">Send</button>` with `disabled={isLoading || !input.trim()}`
**Location**: `client/src/components/Chat.tsx:170-172`
**Details**: Button is inside a `<form onSubmit={handleSubmit}>`. When `isLoading` is true, both the button and textarea are disabled. The spec requires this button to change to "Stop" during loading and call `stop()` on click instead of submitting.

### Textarea / Input State Management

**Finding**: `input` and `handleInputChange` from useChat control the textarea. Textarea is disabled during `isLoading`.
**Location**: `client/src/components/Chat.tsx:161-169`
**Details**: `input` is a string controlled entirely by useChat. There is no separate local state for preserving user input. The spec requires saving the input value before cancel and restoring it after.

### Enter Key Submit Handler

**Finding**: `handleKeyDown` intercepts Enter (without Shift) to submit the form programmatically.
**Location**: `client/src/components/Chat.tsx:124-129`
**Details**: Calls `handleSubmit` with a cast event. This handler would also need to trigger stop if `isLoading` is true — or the textarea is disabled during loading so this is moot.

### Message Ref Pattern

**Finding**: `prevMessagesRef` stores the previous messages array to guard against redundant `onMessagesChange` calls. `appendRef` stores the latest `append` function for external use.
**Location**: `client/src/components/Chat.tsx:98-99` (appendRef), `client/src/components/Chat.tsx:102-114` (prevMessagesRef)
**Details**: The spec requires a "useRef snapshot" pattern for injecting the synthetic interrupted message — similar to `prevMessagesRef` but capturing the current messages at cancel time.

### Error Path

**Finding**: When `error` is truthy, a synthetic error message is appended to `displayMessages` in the render.
**Location**: `client/src/components/Chat.tsx:132-140`
**Details**: Error creates a fake `UIMessage` with `isError: true`. The spec says "error path unchanged", so this stays as-is.

### Form Structure

**Finding**: The form is `<form onSubmit={handleSubmit}>` with flex layout, containing textarea + submit button.
**Location**: `client/src/components/Chat.tsx:160-173`
**Details**: The Stop button behavior requires either: (a) changing the submit handler conditionally, or (b) making the Stop button `type="button"` with an `onClick` instead of being a submit button.

### Test File

**Finding**: Comprehensive test file with mocked `useChat`. The `makeDefaultUseChat` helper does NOT currently include `stop` or `setMessages` fields.
**Location**: `client/src/components/Chat.test.tsx:28-39`
**Details**: Tests will need updates: add `stop` and `setMessages` to `makeDefaultUseChat`, add new test cases for Stop button appearance, cancel behavior, message injection, input preservation, and debounce.

### UIMessage Type

**Finding**: `UIMessage` is re-exported from `"ai"` package (Vercel AI SDK).
**Location**: `shared/types.ts:1-3`
**Details**: The synthetic interrupted message will need to conform to this type. The existing error message pattern at `Chat.tsx:133-140` shows how to construct one with `id`, `role`, `content`, `parts`.

### File Naming Conventions

**Finding**: Components use PascalCase filenames (`Chat.tsx`, `MessageList.tsx`, `OAuthBanner.tsx`). Tests are co-located as `Component.test.tsx`.
**Location**: `client/src/components/`

### Summary of Files Requiring Changes

| File | Change |
|------|--------|
| `client/src/components/Chat.tsx` | Add `stop`, `setMessages` to useChat destructuring; add `isCancelling` state; save/restore input; conditional Send/Stop button; inject synthetic message on cancel |
| `client/src/components/Chat.test.tsx` | Add `stop`, `setMessages` to mock; add tests for Stop button, cancel flow, debounce, input restoration |

No new files need to be created.

