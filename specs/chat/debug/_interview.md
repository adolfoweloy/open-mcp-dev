<!-- spec_id: chat__debug -->
<!-- domain: chat -->
<!-- feature: debug -->
<!-- spec_dir: specs/chat/debug -->

## User Description

Now I have no visibility of what is going on when I send a message in the chat. I don´t know if a call was actually made to the LLM, I don´t know whether the LLM wants to invoke a tool, I don´t know if MCP client is actually calling a tool, I don´t see the requests and responses from mcp client to mcp server. I need all of that to be present in this UI because open-mcp-dev is a tool for developers. for people building mcp servers with ui support. I need this log of calls to be shown in a right handside panel (the chat stays in between the lefthandside panel listing chats and settings. This log panel should show the actors names within square brackets with different colors (e.g. LLM blue, mcp server, green, mcp client, purple, mcp app bridge pink, and so on and so forth - these are just examples of colors, you don't need to use those, use best judgement). On the logs I also want to see them flowing from top bottom with the newest messages at the bottom. I want the messages to show date and time with miliseconds precision.

---

# Instructions: Spec Creation Interview

You are helping the user define a new specification for their project.
This is a multi-turn interview. Each time you respond, your reply and the user's answer
are appended to this file and sent back to you. You will see the full conversation history
below under "Conversation so far".

## Configuration

Your current working directory is already the project src directory (see `fabrikets_src` in the context header).
All file paths are relative to here. Do not navigate outside this directory.

The spec metadata is in the comments at the top of this file:
- `spec_id` — the identifier for this spec (format: `domain__feature`)
- `domain` — the domain group
- `feature` — the feature name
- `spec_dir` — the directory where spec files will be written (e.g. `specs/auth/user_login/`)

## Step 1: Understand the Project

Before asking anything, read the existing context:

- Read `specs/architecture.md` if it exists — understand the global architecture decisions and patterns already established
- Read `specs/specs.yaml` if it exists — understand what's already specified and the status of each
- For 1-2 existing specs, read their `overview.md` to understand the format and level of detail
- Glance at the src directory to understand what's already been built (README, folder structure, key source files)

If none of these exist yet, you're starting a brand new project.

## Step 2: Interview the User

Ask questions in a structured format. Each response should contain one or more numbered
questions, each with lettered options. Always include a free-text option at the end:

```
1 - What is the primary goal of this feature?
  a. Automate an existing manual process
  b. Expose data to external consumers
  c. Other (describe below)

2 - How should errors be handled?
  a. Fail fast and surface to the user
  b. Retry silently in the background
  c. Log and continue
  d. Other (describe below)
```

The user will reply using the format: `1=a, 2=c, 3="my custom answer"`.
Parse their answers before asking the next set of questions.

Ask one round of questions at a time — no more than 3-4 questions per round.

### Functional Requirements

Cover the core behaviour of the feature:
- Primary use cases and user goals
- Inputs, outputs, and data flows
- Business rules and constraints
- Edge cases and error handling
- Interactions with existing components

### Non-Functional Requirements

Once functional requirements are clear, explicitly ask about:
- **Performance**: acceptable latency, throughput expectations
- **Scalability**: expected load now and in the future
- **Security**: authentication, authorisation, data sensitivity
- **Reliability**: acceptable downtime, consistency guarantees
- **Observability**: logging, metrics, alerting needs
- **Maintainability**: who owns this, how often will it change

### When to call the Architect

Once you have a solid picture of both functional and non-functional requirements,
output `[ARCHITECT]` on its own line. The system will automatically run an architect
subagent that reviews the requirements for tradeoffs and risks. Its findings will be
appended to this conversation as "Architect Review:" for you to incorporate before
writing the spec.

## Step 3: Write the Spec Files

Write three files to `<spec_dir>/`:

### `<spec_dir>/overview.md`

A concise 1-page summary of the feature. Must include:
- Purpose and scope (2-3 sentences)
- Key design decisions made
- Non-goals (what this explicitly does NOT do)
- References to the other files:
  ```
  - Requirements: [requirements.md](requirements.md)
  - Design: [design.md](design.md)
  ```

Keep this under ~100 lines. This file is always loaded — keep it tight.

### `<spec_dir>/requirements.md`

All functional and non-functional requirements. Structure as:

```markdown
## Functional Requirements

### <Use Case Name>
- <requirement>
- <requirement>

## Non-Functional Requirements

| Concern | Requirement |
|---------|-------------|
| Performance | ... |
| Scalability | ... |
| Security | ... |
| Reliability | ... |
| Observability | ... |
```

Be specific and testable. No prose — bullet points and tables only.

### `<spec_dir>/design.md`

Design decisions, data model, interfaces, and component interactions:

```markdown
## Data Model
<types, schemas, or database tables>

## Interfaces
<API contracts, function signatures, message formats>

## Component Design
<how this fits into the existing architecture, key components, sequence flows>

## Key Decisions
<decisions made and why, with alternatives considered>
```

## Step 4: Update Global Architecture

Read `specs/architecture.md` (create if it doesn't exist).

Add or refine entries that reflect system-wide patterns, decisions, or constraints
established or confirmed by this spec. This file captures cross-cutting concerns that
affect multiple features — things like: chosen tech stack, data storage strategy,
auth model, API conventions, error handling patterns, deployment constraints.

Do NOT copy per-feature detail here. Only add what is genuinely global.

## Step 5: Register the Spec

Add the new entry to `specs/specs.yaml` (create if it doesn't exist):

```yaml
specs:
  - id: auth__user_login
    domain: auth
    feature: user_login
    description: Brief description of what this spec covers
    status: todo
```

Valid status values: `todo`, `wip`, `done`.

## Step 6: Commit

Commit the spec files so they are versioned in the project repository:

```bash
git add specs/
git commit -m "spec: <domain>/<feature> - <brief summary>"
```

Example: `spec: auth/user_login - user authentication with session management`

## Step 7: Confirm and Finish

Show the user a brief summary of what you wrote and ask if it captures what they want.
Offer to refine based on their feedback.

Once the user confirms the spec is correct, output `[DONE]` on its own line.
This signals the system that the interview is complete and will end the session.


Assistant: Good understanding of the codebase. The app currently has left sidebar + center chat. You want a right-side debug panel showing event logs per chat session.

Let me ask a few clarifying questions:

```
1 - What events/actors should appear in the debug log?
  a. Only the ones you listed: LLM request/response, tool invocation intent, MCP client→server call, MCP server→client response
  b. Also include: OAuth flows, MCP connection events (connect/disconnect), internal errors
  c. All of the above plus raw streaming chunks from the LLM
  d. Other (describe below)

2 - How much detail per event entry?
  a. Actor + event type + summary (e.g. "tool: weather__get_forecast called with {city: 'Paris'}")
  b. Full request/response payloads shown inline (expandable JSON)
  c. Full payloads always visible (no collapsing)
  d. Other (describe below)

3 - How should the panel behave across conversations?
  a. Log clears when you switch conversations (each conversation has its own log)
  b. Log is global — persists across conversation switches
  c. Log always clears on page reload (ephemeral), but persists during same session when switching
  d. Other (describe below)

4 - Panel visibility:
  a. Always visible (fixed, takes up column space)
  b. Toggleable via a button — hidden by default, user can show/hide it
  c. Toggleable — visible by default
  d. Other (describe below)
```

User: 1.b, 2.b, 3.d I want that each conversation has its own log. It only clears when I create a new chat. (maybe store it in the localstorage?), 4.b

Assistant: Parsed: events = LLM + tools + MCP + OAuth + connection events + errors; payloads expandable; per-conversation logs stored in localStorage; panel hidden by default.

```
1 - Where should the toggle button live?
  a. In the top navigation/toolbar (e.g. a "Debug" or bug icon button)
  b. On the right edge of the chat area (a tab or arrow handle)
  c. Other (describe below)

2 - Should there be any controls inside the debug panel?
  a. None — just the log stream
  b. A "Clear log" button only
  c. Clear + filter by actor (e.g. show only LLM events)
  d. Clear + filter + search by text
  e. Other (describe below)

3 - Large payloads: what should happen when a single event payload is very large (e.g. a 50KB LLM response)?
  a. Show first ~500 chars then a "show more" toggle
  b. Always fully expandable, no truncation
  c. Cap the stored payload at a fixed size (e.g. 10KB) and mark it as truncated
  d. Other (describe below)

4 - localStorage limits: if the log grows very large across many conversations, should we:
  a. Keep only the last N conversations (e.g. 20) and drop older ones
  b. Keep only the last N entries per conversation (e.g. 500 events)
  c. Both: cap per-conversation entries AND total conversations stored
  d. Other (describe below)
```

User: 1.b, 2.b, 3.c, 4.instead of storing it lets actually not store the logs. If the person switches across chats just clean the logs (offer an option to download the logs -- as a debug-chat.log)

Assistant: Parsed: toggle on right edge of chat area; clear button + download button; payloads capped at ~10KB (marked truncated); logs are in-memory only, cleared on conversation switch, downloadable as `debug-chat.log`.

One more round before I write the spec:

```
1 - How wide should the debug panel be?
  a. Fixed width (e.g. 400px)
  b. Resizable by dragging
  c. Fixed but responsive (e.g. 30% of viewport)
  d. Other (describe below)

2 - When the debug panel is open, what happens to the chat area?
  a. Chat shrinks to make room (panel pushes it)
  b. Panel overlays the chat (no layout shift)
  c. Other (describe below)

3 - Event capture: where should debug events be intercepted?
  a. In the existing API/service layer (hook into existing fetch calls)
  b. Via a dedicated event bus / context that components emit to
  c. Other (describe below)
```

User: 1.b, 2.a, 3.b