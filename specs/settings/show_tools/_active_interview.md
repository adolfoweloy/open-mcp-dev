<!-- spec_id: settings__show_tools -->
<!-- domain: settings -->
<!-- feature: show_tools -->
<!-- spec_dir: specs/settings/show_tools -->

## User Description

when I go to settings and I see the servers there, I want to be able to click on the server or an option (another button close to the server) that allows me to see all the tools made available by the server. I want to see the tools and I want them to be expandable. when clicked they should expand and show the tool description, inputSchema, etc. The tools and desscriptions should be presented in a modal and the modal should have a close button. The inputSchema, output definition if it exists, resources linked, these should be formatted as code

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

Write two files to `<spec_dir>/`:

### `<spec_dir>/overview.md`

A concise 1-page summary of the feature. Must include:
- Purpose and scope (2-3 sentences)
- Key design decisions and tradeoffs
- Non-goals (what this explicitly does NOT do)
- Reference to requirements: `- Requirements: [requirements.md](requirements.md)`

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


Assistant: Let me look at the existing settings implementation and an existing spec for reference.Good context. The user description is quite clear. Let me ask a focused first round.

```
1 - How should the "view tools" action be triggered on the server row?
  a. Click anywhere on the server name/row
  b. A dedicated button (e.g. "Tools" or list icon) next to each server row
  c. Both (row is clickable, plus an explicit button)

2 - Where should tool data come from?
  a. A new backend endpoint that queries the live MCP client for its tools
  b. Tools already cached/available on the frontend from an existing endpoint
  c. I don't know — you decide what makes sense

3 - Should the modal show tools for disconnected servers too (empty state), or only be accessible when the server is connected?
  a. Only accessible when server is connected (button/row disabled otherwise)
  b. Always accessible — show an empty state or "server not connected" message if disconnected
```

User: 1.b, 2.a, 3.a

Assistant: Good. A couple more questions to nail down the details:

```
4 - What should the "view tools" button look like?
  a. A small icon button (e.g. wrench/list icon) — no text label
  b. A small text button labelled "Tools" or "View Tools"
  c. Either — you decide what fits the existing row style

5 - When a tool is expanded, which fields should be shown?
  a. Description + inputSchema only (the most useful)
  b. Description + inputSchema + outputSchema (if present) + annotations (if present)
  c. Everything the MCP server returns for that tool (all fields, raw)
  d. Other (describe below)

6 - Should there be any search/filter inside the modal (e.g. filter tools by name)?
  a. Yes — a search input at the top
  b. No — just scroll through the list
```

User: [B[B[B[B[B[B4.b, 5.b (don´t forget to also bring resources, not only tools), 6.a