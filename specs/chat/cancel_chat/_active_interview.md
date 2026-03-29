<!-- spec_id: chat__cancel_chat -->
<!-- domain: chat -->
<!-- feature: cancel_chat -->
<!-- spec_dir: specs/chat/cancel_chat -->

## User Description

When the LLM is streamming content to the chat, I would like to be able to stop the generation as in all AI chats that exist today. The send Button should become a stop button that is clicable so I can cancel the streamming and generation. while it is generating, the text box must keep disabled as it is now, but when I click stop it should stop the generation, there should be a message in the chat saying that the generation was interrupted and the button stop should become "send" again and the input text should become enabled for typing again.

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


Assistant: I've reviewed the codebase. The chat uses `useChat` from `@ai-sdk/react`, which already exposes a `stop()` function — this is the hook we'll use to cancel the stream. Now a few questions to pin down the details:

```
1 - When the user cancels, what happens to the partial response that was already streamed?
  a. Keep it in the chat as-is, then append an "interrupted" notice below it
  b. Discard the partial response entirely; only show the "interrupted" notice
  c. Other (describe below)

2 - How should the "generation was interrupted" notice appear?
  a. As a new assistant message in the chat thread (e.g. "⚠ Generation interrupted.")
  b. As a subtle inline badge/label attached to the partial message
  c. Other (describe below)

3 - After cancellation, is the input restored with the original text the user typed, or left blank?
  a. Restored with the original message text so the user can re-send easily
  b. Left blank
  c. Other (describe below)
```

User: 1.a, 2.a, 3.a

Assistant: Good, a couple more to cover edge cases:

```
4 - If the stream errors out on its own (network drop, server error) before the user clicks Stop,
    should it behave the same way as a user-initiated cancel?
  a. Yes — same "Generation interrupted" message and same restore behaviour
  b. No — show a distinct error message instead
  c. Other (describe below)

5 - Should the Stop button be visually distinct from the Send button
    (e.g. red background, different icon) or just relabelled "Stop"?
  a. Visually distinct — different colour/icon (e.g. red, square stop icon)
  b. Same style as Send, just relabelled "Stop"
  c. Other (describe below)

6 - Any concern about double-clicks or race conditions on the Stop button
    (e.g. user clicks Stop twice)?
  a. No special handling needed — one click is enough, just disable after first click
  b. Debounce / ignore subsequent clicks while cancel is in-flight
  c. Other (describe below)
```

User: 4.b, 5.b, 6.b