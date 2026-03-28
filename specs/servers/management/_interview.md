<!-- spec_id: servers__management -->
<!-- domain: servers -->
<!-- feature: management -->
<!-- spec_dir: specs/servers/management -->

## User Description

the servers management panel looks good. but the cog icon is horrible. it would be better to just use words "Settings" as a link. Besides, the UI is confusing. Under MCP Servers it shows a checkbox with a button "disconnect". I think that at that level, we should be able to just toggle on and off for the current chat but connection and disconnection should be done from the settings page only.

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


Assistant: Good picture of the current state. Here's what I see:

- `ServerSidebar`: shows checkbox + connect/reconnect/disconnect buttons per server
- `App.tsx`: uses a gear icon `⚙` at the bottom-left to open the settings drawer
- `SettingsDrawer`: shows servers with edit/delete only (no connect/disconnect)

Let me ask a few questions to nail the spec:

```
1 - What does the sidebar toggle (checkbox) represent?
  a. Enable/disable this server's tools for the current chat session only
  b. Enable/disable this server's tools globally (all chats)
  c. Other (describe below)

2 - When a server is disconnected, should it still appear in the sidebar with a toggle?
  a. Yes — show it greyed out / disabled, user can't toggle it
  b. Yes — show it normally, toggling it just means "use it when it reconnects"
  c. No — only show connected servers in the sidebar
  d. Other (describe below)

3 - Should the Settings drawer gain Connect / Disconnect / Reconnect controls (currently it only has Edit / Delete)?
  a. Yes — add connect/disconnect actions to the settings drawer
  b. No — connection is fully automatic; just show status
  c. Other (describe below)

4 - Should a server with a connection error show anything actionable in the sidebar?
  a. No — just show error badge, fix it in Settings
  b. Yes — show a small "retry" link
  c. Other (describe below)
```

User: 1.a, 2.a, 3.a, 4.(show the reason for the connection error)

Assistant: Good. A few more questions to get the details right:

```
5 - When a server is toggled OFF for the current chat, what happens to its tools?
  a. Tools are hidden from the LLM entirely (removed from tool list)
  b. Tools stay visible but calls to them are blocked
  c. Other (describe below)

6 - Is the enabled/disabled toggle state per-chat, or does it persist across page reloads for that chat?
  a. Per-chat, stored in localStorage with the conversation (lost on new chat)
  b. Per-chat, but defaults to "on" for every new chat — user opts out each time
  c. Other (describe below)

7 - Connection error display in the sidebar — what level of detail?
  a. Just the error message string (e.g. "ECONNREFUSED 127.0.0.1:3001")
  b. A short human-readable label (e.g. "Connection refused") — not the raw error
  c. A tooltip on the error badge showing the raw message
  d. Other (describe below)

8 - The "Settings" link replacing the gear icon — where exactly?
  a. Bottom of the sidebar, same position as the current gear icon
  b. At the top or header of the sidebar
  c. Other (describe below)
```

User: 5.b, 6.a, 7.a, 8.a