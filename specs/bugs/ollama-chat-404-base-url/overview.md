# Bug: Ollama chat returns 404 "Not Found" due to base_url mismatch

## Description
The `base_url` config value for Ollama is used inconsistently between the model-listing
and chat code paths. The model-listing route (`routes/models.ts`) appends `/api/tags`
to the raw base URL, so `http://localhost:11434/api/tags` works. But the chat path
(`lib/models.ts`) passes the same raw URL directly to `createOllama({ baseURL })`, which
expects a URL already ending in `/api` (the SDK appends `/chat` to produce `/api/chat`).
The result is the SDK hitting `http://localhost:11434/chat` instead of
`http://localhost:11434/api/chat`, returning a 404.

The default in `lib/models.ts` masks this by hardcoding `http://localhost:11434/api`,
but any user-provided `base_url` without the `/api` suffix triggers the bug.

## Symptoms
- "Error: Not Found" displayed in the chat UI when sending a message with an Ollama model.
- HTTP 500 on `/api/mcp/servers` starts repeating in the browser console after the failed
  chat request (cascading error, polling continues hitting a broken state).
- Model listing in the dropdown works fine (models are visible and selectable).

## Reproduction Steps
1. Set `llm.ollama.base_url` to `"http://localhost:11434"` in `config.yaml` (the natural
   value a user would write, matching Ollama's actual listen address).
2. Ensure Ollama is running locally with at least one model pulled.
3. Open the app, select an Ollama model from the dropdown.
4. Send a chat message.

## Expected Behaviour
The message is sent to Ollama at `http://localhost:11434/api/chat` and a response streams
back normally.

## Actual Behaviour
The request hits `http://localhost:11434/chat` (missing `/api` segment), Ollama returns
404 "Not Found", and the UI shows "Error: Not Found".

## Area Affected
`server/lib/models.ts` -- `createModel()` function, Ollama provider instantiation.
