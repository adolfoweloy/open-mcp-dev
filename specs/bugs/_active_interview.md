<!-- mode: bug -->

<!-- permissions: run_commands -->

## Bug Report

I want to describe a few issues with the UI now.

- In the chat, when the scrollbar is activated, I can´t scroll up when the text is being generated. It stubbornly keeps me following the tail of the chat. That is horrible experience. I should be able to go up if I want.
- The iframe where the MCP ui widget is presented has no border. It should have a thin light border so that the boundaries are clear.

- The active (connected) server shows up witha checkbox and the name. However I can´t unselect (toggle off) the mcp server there.

- The debug right hand side bar doesn´t allow me to scroll down when I expand the logs to see the responses inside them. Fix this.
- The style within the debug area is simply gross. The logs should have a better font proper for logs. The messages that contains details should show some sort of arror that shows me that there is something there and that I can click to expand /collapse. The content within it should be presented in a buuble like style (like in the chat) with a code formatted styled fashion.

---

# Instructions: Bug Interview

You are helping the user document a bug in their project.
This is a multi-turn interview. Each time you respond, your reply and the user's answer
are appended to this file and sent back to you. You will see the full conversation history
below under the bug report.

## Configuration

Your current working directory is already the project src directory.
All file paths are relative to here. Do not navigate outside this directory.

## Step 1: Understand the Context

Read the bug report above (under "Bug Report"). Then:
- Read `specs/specs.yaml` if it exists — understand existing specs
- Read `specs/architecture.md` if it exists — understand the architecture
- List existing directories under `specs/bugs/` to know which slugs are already taken
- Browse source code in the area most likely related to the bug
- If the header contains `<!-- permissions: run_commands -->`, you MAY run shell commands
  (tests, linter, the application itself) to reproduce and investigate the bug.
  If that comment is absent, do NOT run any commands — only read files and ask questions.

## Step 2: Interview the User

Ask clarification questions to fully understand the bug. You need enough detail to write
a clear, actionable bug spec. Focus on:
- Exact reproduction steps (if not provided)
- Expected vs actual behaviour
- Error messages, stack traces, logs
- When it started happening (if known)
- Frequency (always, sometimes, only under certain conditions)
- Environment details if relevant

Ask 2-3 questions per round. Use a structured format:

```
1 - Does this happen every time or only intermittently?
  a. Every time
  b. Sometimes
  c. Only under specific conditions (describe below)

2 - Which endpoint / page / component is affected?
  a. ...
  b. ...
  c. Other (describe below)
```

The user will reply with answers like: `1=a, 2="the /users page"`.

**Do NOT document the bug until you have a clear understanding of the problem.**
Keep asking until you can write specific reproduction steps and acceptance criteria.

## Step 3: Document the Bug

Once you are confident you understand the bug, create the spec files.

### Pick a slug

Choose a descriptive, lowercase, hyphenated slug (e.g. `save-crashes-empty-form`).
Check that `specs/bugs/<slug>/` does not already exist. If it does, pick a different slug.

### Create `specs/bugs/<slug>/overview.md`

```markdown
# Bug: <one-line summary>

## Description
<Clear description of the bug.>

## Symptoms
<What the user observes — errors, wrong output, crashes.>

## Reproduction Steps
1. <step>
2. <step>
3. <step>

## Expected Behaviour
<What should happen instead.>

## Actual Behaviour
<What happens now.>

## Area Affected
<Component, module, or feature affected.>
```

### Create `specs/bugs/<slug>/requirements.md`

Write **specific, testable** acceptance criteria for this bug fix. Not generic boilerplate —
derive them from the actual bug and the clarifications gathered during the interview.

Good example (for a "save crashes on empty form" bug):
```markdown
# Fix Requirements

## Acceptance Criteria
- Clicking Save on an empty form shows a validation error listing required fields
- Clicking Save on a partially filled form shows errors only for missing required fields
- Clicking Save on a fully filled form submits successfully (existing behaviour preserved)
- No unhandled exception is thrown for any combination of form inputs

## Non-Goals
- Redesigning the form validation UX
- Adding client-side validation (server-side fix only for now)
```

Bad example:
```markdown
## Acceptance Criteria
- The bug no longer occurs
- No regression
- A test is added
```

### Register in specs.yaml

Append a new entry to `specs/specs.yaml`:

```yaml
- id: bugs__<slug>
  domain: bugs
  feature: <slug>
  description: <one-line summary>
  status: todo
```

### Commit

```bash
git add specs/
git commit -m "bug: <slug> - <one-line summary>"
```

## Step 4: Confirm and Finish

Show the user a brief summary of what you documented. Offer to refine if anything is off.

Once the user confirms, output `[DONE]` on its own line.
This signals the system that the interview is complete and will end the session.


Assistant: Good context gathered. I can see the issues clearly in the code. Let me ask a few clarifying questions before documenting.

---

**1 — For the chat auto-scroll lock** (MessageList.tsx always calls `scrollIntoView` on every message change with no user-scroll detection):
What's your expectation for re-engaging auto-scroll after you've scrolled up manually?
  a. Auto-resume following the tail once you scroll back down to near the bottom
  b. Only resume on the next message send (new conversation turn)
  c. Stay wherever you scrolled to — no auto-resume

**2 — For the server sidebar toggle** — I can see `disabled={!server.connected}`, so connected servers should be toggleable. When you try to uncheck a connected server:
  a. The checkbox appears greyed out / visually disabled (can't click it at all)
  b. You can click it but nothing changes (state doesn't update)
  c. Something else (describe)

**3 — For the debug panel scroll** — when you expand a log entry to see its payload, where does the scroll break down?
  a. The whole debug panel stops scrolling (even the outer area)
  b. The expanded content itself overflows/clips without a scrollbar
  c. The panel scrolls but jumps back to a weird position

**4 — For the debug panel styling** — on the "bubble-like style with code formatted fashion": should the expanded payload content look similar to the chat's assistant message bubbles (dark rounded bg), or more like a terminal/VS Code style code block?
  a. Chat-style bubble (rounded, dark bg, similar to assistant messages)
  b. Terminal/code block style (monospace, syntax-highlighted, distinct border)
  c. Either is fine — just better than the current raw `<pre>` block

User: 1.a, 2.b, 3.a, 4.b