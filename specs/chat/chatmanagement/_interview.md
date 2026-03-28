<!-- spec_id: chat__chatmanagement -->
<!-- domain: chat -->
<!-- feature: chatmanagement -->
<!-- spec_dir: specs/chat/chatmanagement -->

## User Description

When I create a new chat, all new chats share the same chat. All the conversations from one chat are visible in the other chats. It seems that the datasource or model is the same shared acrros all chats. They are not individual chats.\

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


Assistant: Now I have a good understanding of the codebase. Let me look at the existing chat-related code to understand the bug better before asking questions.

The bug is in `Chat.tsx:33` — `useChat` from the Vercel AI SDK is initialized with `id: conversation?.id` and `initialMessages: conversation?.messages`, but there's likely a state isolation issue when switching conversations. I can see the conversation structure is in place, but the `useChat` hook may be sharing state across conversation switches.

Now let me ask some clarifying questions about the scope of this spec:

---

**Understanding the bug context:**
The issue is that all conversations appear to share the same message store — when a new chat is created, messages from other chats bleed in. Before scoping the spec, I need to understand how broad this should be.

---

```
1 - Is this spec focused purely on fixing the isolation bug (each chat should
    have independent messages), or does it also need to define missing chat
    management actions?
  a. Bug fix only — just ensure each conversation is properly isolated
  b. Bug fix + add missing actions like delete chat, rename chat
  c. Full chat management redesign (delete, rename, reorder, search/filter)
  d. Other (describe below)

2 - Should deleting a conversation be supported?
  a. Yes — with a confirmation prompt before deleting
  b. Yes — immediate delete, no confirmation
  c. No — not needed

3 - Should conversations be renameable by the user?
  a. Yes — user can manually rename a chat
  b. No — auto-title from first message is sufficient
  c. Other (describe below)
```

User: 1.a, 2.b, 3.a

Assistant: Good. Now I understand the root cause precisely:

- `Chat` is never unmounted when switching conversations — only the `conversation` prop changes
- `useChat`'s `initialMessages` is only applied on first mount, not when `id` changes
- Fix: add `key={conversation.id}` on `<Chat>` in `App.tsx` to force remount on switch

A few more questions to nail down the rename + delete UX:

```
4 - How should the user trigger a rename?
  a. Click the chat title in the sidebar to edit it inline
  b. Double-click the chat title in the sidebar
  c. Right-click context menu on the chat item
  d. Other (describe below)

5 - Where should the delete action live?
  a. Button that appears on hover next to the chat title in the sidebar
  b. Right-click context menu on the chat item
  c. Same as rename — wherever rename is, delete is next to it
  d. Other (describe below)

6 - If the active conversation is deleted, what happens?
  a. Switch to the most recent remaining conversation (or show empty state if none)
  b. Always show empty state after delete
  c. Other (describe below)
```

User: 4.d there should be a small meat-ball menu, 5.a, 6.a

Assistant: Got it — a meatball menu (⋯) that appears on hover over a chat item, containing both Rename and Delete actions. One last round before writing the spec:

```
7 - How should rename be confirmed?
  a. Press Enter to confirm, Escape to cancel (inline edit in sidebar)
  b. A small modal/popover with a text field and Save/Cancel buttons
  c. Other (describe below)

8 - Should conversations persist across page reloads?
  a. Yes — persisted in localStorage (already the case)
  b. No — in-memory only is fine

9 - Any concern about conversations with many messages causing performance
    issues when switching chats?
  a. No — current scale is small, not a concern
  b. Yes — we should paginate or lazy-load messages
```

User: 7.a, 8.a, 9.a