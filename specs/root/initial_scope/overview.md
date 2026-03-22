# MCP Chat Client — Overview

A lightweight, local-first chat client that connects to MCP servers and uses OpenAI or Ollama models. Single-user, no cloud backend, no persistence beyond localStorage for chat history and in-memory OAuth tokens.

The client implements the ChatGPT Apps SDK `window.openai` bridge so that MCP apps built for ChatGPT (using `requestDisplayMode`, `ui/message`, `tools/call`, etc.) work unmodified inside our iframe renderer.

## Key Design Decisions

- **Config-driven setup**: all LLM providers and MCP servers are declared in `config.yaml`; no setup UI
- **Vercel AI SDK for streaming**: `streamText()` + `pipeUIMessageStreamToResponse()` + `useChat()` handle multi-step agentic loops
- **MCPClientManager**: single server-side instance manages all MCP connections; auto-connects non-OAuth servers at startup
- **ChatGPT Apps SDK bridge**: iframe postMessage bridge exposes `window.openai` to MCP UI apps; supports `requestDisplayMode({mode:"fullscreen"})` → true fullscreen overlay, plus `ui/message` and `tools/call`
- **localStorage persistence**: conversation history survives page refresh; no server-side storage
- **Per-provider system prompts**: `llm.openai.system_prompt` / `llm.ollama.system_prompt` in config.yaml

## Non-Goals

- User accounts, authentication, sessions, or multi-user support
- Cloud backend, database, or server-side persistence
- LLM providers other than OpenAI and Ollama
- MCP resource proxy for non-HTML resources (images, JSON, etc.)
- OAuth token persistence across server restarts
- Dynamic MCP server registration (servers must be in config.yaml)

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
