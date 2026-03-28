<!-- spec_id: root__server_settings_ui -->
<!-- domain: root -->
<!-- feature: server_settings_ui -->
<!-- spec_dir: specs/root/server_settings_ui -->

## User Description

we have a way to connect MCP servers right? now I want to surface these settings to the UI. I want to be able to add, edit, delete MCP servers form the UI. I want a menu settings at the bottom left corner (same as chatgpt and claude desktop). When the user clicks on that settings page I want a popup to to ask for the MCP server's details. you know what is required to run an MCP server so you know what are the fields, properties, checkboxes, flags etc that are needed to properly configure an MCP server to be used by open-mcp-dev. At this point I also expect this project to have an MCP client implementation that can use the MCP server and that provides the MCP apps sdk to the MCP server so that it can be used when implementing UI resources (that runs inside an iframe - same as chatgpt). So double check that besides allowing for having the settings via UI, that it will also work when connected.

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


Assistant: Good, I have a solid understanding of the project. Now let me ask the user the interview questions.

I've reviewed the project structure. Here's what I found:

- Config-driven: MCP servers are declared in `config.yaml` (gitignored) — currently **no UI** for managing them
- Two server types: `stdio` (command + args + env + timeout) and `http` (url + oauth + client_id/secret + tokens + prefer_sse + timeout)
- `MCPClientManager` on the server manages connections at startup
- Architecture already has the ChatGPT Apps SDK iframe bridge
- Currently listed as a non-goal: "Dynamic MCP server registration (servers must be in config.yaml)"

This feature upgrades that non-goal into a real feature. Let me ask a few key questions:

---

**1** — Where should MCP server config be persisted after the UI edits it?
  a. Write back to `config.yaml` on disk (requires a new API endpoint)
  b. Separate persistence file (e.g. `servers.json`) that merges with `config.yaml` at startup
  c. In-memory only (lost on restart; `config.yaml` stays read-only)
  d. Other (describe below)

**2** — When a server is added/edited/deleted via the UI, should changes take effect immediately (hot-reload the MCP connection) or only after a server restart?
  a. Immediately — reconnect/disconnect the server on save without restarting the Node process
  b. After manual restart only — just persist the config change, no live reconnect
  c. Other (describe below)

**3** — For the settings panel placement and UX, how close to ChatGPT/Claude Desktop do you want it?
  a. Gear/settings icon button fixed at bottom-left of the sidebar → opens a full modal dialog
  b. Gear/settings icon → opens a slide-over/drawer panel
  c. Inline expansion within the sidebar
  d. Other (describe below)

**4** — OAuth-enabled HTTP servers require a client ID, secret (optional), and pre-configured tokens (optional). Should sensitive fields (client_secret, access_token, refresh_token) be masked/redacted in the UI form (show `●●●●` once saved)?
  a. Yes — mask them after saving; require explicit "edit" click to change
  b. No — always show plain text (it's a local-only app)
  c. Other (describe below)

User: 1.a, 2.a, 3.b, 4.b (add a message explaining the reason why we show plain text - because its a local-only app).

Assistant: Parsed:
- **1=a** Write back to `config.yaml` via a new API endpoint
- **2=a** Hot-reload: reconnect/disconnect immediately on save
- **3=b** Gear icon → slide-over drawer
- **4=b** Plain text always, with an explanatory note in the UI

A few more questions to nail down the form UX and connection behaviour:

---

**5** — Each server has a **name** (the key in `config.yaml`). How should renaming a server be handled?
  a. Name is editable in the form — renaming replaces the old key in `config.yaml`
  b. Name is set only on creation and is read-only after that
  c. Other (describe below)

**6** — `stdio` servers take `args` (an array) and `env` (key-value pairs). What UI pattern should be used for these?
  a. `args`: space-separated text input (split on spaces); `env`: `KEY=VALUE` rows with add/remove buttons
  b. `args`: one line per arg (textarea or tag-chip input); `env`: same `KEY=VALUE` rows
  c. Other (describe below)

**7** — After saving, the server connects immediately. What should the UI show for connection status?
  a. A status badge per server in the drawer (connecting → connected / error with message)
  b. A toast/notification only on error; no persistent status badge
  c. No feedback beyond the save action completing
  d. Other (describe below)

**8** — Regarding the iframe Apps SDK bridge: the architecture already has the `window.__MCP_APPS_SDK__` bridge. Should the settings UI also include a toggle per server for **"expose this server's tools to iframe apps"**, or should all connected servers be available to iframes automatically?
  a. Automatic — all connected servers are exposed to iframes
  b. Per-server toggle — explicit opt-in per server
  c. Other (describe below)

User: 5.a, 6.a, 7.a (once enabled it will be used on every chat), 8.a