<!-- spec_id: oauth_authorisation__dynamic_registration_oauth_flow -->
<!-- domain: oauth_authorisation -->
<!-- feature: dynamic_registration_oauth_flow -->
<!-- spec_dir: specs/oauth_authorisation/dynamic_registration_oauth_flow -->

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

## Step 6: Confirm and Finish

Show the user a brief summary of what you wrote and ask if it captures what they want.
Offer to refine based on their feedback.

Once the user confirms the spec is correct, output `[DONE]` on its own line.
This signals the system that the interview is complete and will end the session.


Assistant: I've reviewed the existing architecture. Here's what I see:

- The project is a local-first MCP chat client (Node.js + Express + React + TypeScript)
- `MCPClientManager` already accepts an `accessToken` param for HTTP connections and has `oauth: true` config flag
- Architecture notes OAuth2 Authorization Code + PKCE is planned, tokens in-memory, lost on restart
- The existing non-goals include "OAuth token persistence across server restarts" — this is still a non-goal unless you say otherwise

The feature `dynamic_registration_oauth_flow` implies RFC 7591 — the OAuth client registers itself with the MCP server's authorization server at runtime, rather than using pre-configured client credentials.

Let me ask a first round of questions:

```
1 - What triggers the OAuth flow?
  a. User clicks "Connect" on an MCP server in the UI
  b. Automatically when a tool call gets a 401
  c. Both: auto-trigger on 401, manual connect button for known-OAuth servers
  d. Other (describe below)

2 - What does "dynamic registration" mean here?
  a. The MCP client (our Express server) registers itself as an OAuth client
     with the MCP server's auth server at runtime (RFC 7591), getting back
     a client_id/client_secret dynamically
  b. MCP servers can be added/removed from config.yaml at runtime without restart
  c. Both of the above
  d. Other (describe below)

3 - After the user authorizes in their browser, how should the callback work?
  a. Our Express server has a /oauth/callback route; browser redirects there
  b. A deeplink / custom protocol to the desktop app
  c. Other (describe below)

4 - Where should the OAuth client credentials (client_id, etc.) be stored
    after dynamic registration?
  a. In-memory only (lost on server restart, re-registers each time)
  b. Persisted to disk (e.g. a local JSON file) so re-registration is avoided
  c. Other (describe below)
```

User: 1.c, 2.a, 3.a, 4.a

Assistant: You've hit your limit · resets 4am (Australia/Sydney)

User: 1.c, 2.a, 3.a, 4.a

Assistant: Good. Answers parsed:
- **1=c** — trigger on both: manual connect and auto-trigger on 401
- **2=a** — RFC 7591 dynamic client registration (runtime client_id/secret)
- **3=a** — Express `/oauth/callback` route handles the redirect
- **4=a** — in-memory only (consistent with existing auth model)

Round 2:

```
5 - When a 401 triggers the OAuth flow, what happens to the original request?
  a. It's dropped; the user must retry manually after auth completes
  b. It's queued and replayed automatically once the token is obtained
  c. Other (describe below)

6 - How should the browser-side auth flow work (since our app is a local SPA)?
  a. Open a new browser tab/popup to the MCP server's auth URL; our /oauth/callback
     closes it and signals the main app
  b. Redirect the main app window to the auth URL; auth callback redirects back
  c. Other (describe below)

7 - What MCP OAuth discovery mechanism do we follow?
  a. RFC 8414 — GET /.well-known/oauth-authorization-server on the MCP server host
  b. MCP spec's own discovery (GET /mcp with WWW-Authenticate header parsing)
  c. Both: try MCP spec discovery first, fall back to RFC 8414
  d. Hardcoded fields in config.yaml per server (no discovery)
  e. Other (describe below)
```

User: 5.b, 6.a, 7.c

Assistant: Answers parsed:
- **5=b** — queue and replay original request after auth completes
- **6=a** — new tab/popup for auth; callback closes it and signals main app
- **7=c** — MCP spec discovery first, fall back to RFC 8414

Round 3 — edge cases and non-functional:

```
8 - What happens if dynamic registration fails (e.g. server doesn't support RFC 7591)?
  a. Fall back to prompting the user to manually enter a client_id/secret
  b. Show an error; don't attempt connection
  c. Try with empty/default client credentials (some servers allow unregistered clients)
  d. Other (describe below)

9 - Token refresh — access tokens expire. How should this be handled?
  a. Use the refresh_token if provided; re-run full auth flow if refresh fails
  b. Always re-run the full auth flow when the token expires (no refresh)
  c. Let the 401 auto-trigger logic handle it (treat expired token same as no token)
  d. Other (describe below)

10 - PKCE is required for public clients. Since we're registering dynamically,
     should we register as:
  a. A public client (no client_secret, PKCE required)
  b. A confidential client (client_secret issued, PKCE still used for safety)
  c. Let the server decide; use whatever credentials are returned

11 - Observability: what level of logging do we need for the OAuth flow?
  a. Minimal — only errors
  b. Standard — start/complete/error events at INFO level
  c. Verbose — full request/response details for debugging
  d. Other (describe below)
```

User: 8.b, 9.a, 10.a, 11.b

Assistant: Answers parsed:
- **8=b** — show error if registration fails; abort connection
- **9=a** — use refresh_token; re-run full flow if refresh fails
- **10=a** — public client, PKCE required, no client_secret
- **11=b** — INFO-level logging on start/complete/error

I have enough to proceed. Let me get an architect review on the design.

[ARCHITECT]

Architect Review:
**Tradeoffs**

- **In-memory client credentials + tokens vs. persistence**: Every server restart triggers re-registration (RFC 7591) and re-authentication for every connected MCP server. Chosen for simplicity, consistent with existing model, but UX degrades proportionally with the number of connected servers.

- **Queue-and-replay vs. drop-and-retry**: Replaying queued requests after auth completes gives a seamless UX but introduces state management complexity — especially under concurrent 401s from the same server (risk of multiple simultaneous auth flows). Drop-and-retry is simpler but shifts burden to the user.

- **Public client (no secret) + PKCE vs. confidential client**: Correct choice for a local app that can't protect secrets. However, public client registration via RFC 7591 without a secret means any client can impersonate it — PKCE is the primary security control. The implementation must get PKCE right.

- **Popup/tab for auth vs. main-window redirect**: Popup keeps the app state intact but is fragile — browsers block popups aggressively. Popup blockers will silently kill the flow if the popup isn't opened in direct response to a user gesture (e.g., auto-trigger on 401 with no preceding click).

- **Hard error on registration failure vs. fallback to manual credentials**: Simple and honest, but means zero connectivity if the MCP server doesn't support RFC 7591. No escape hatch for the user.

---

**Risks**

- **Concurrent 401 storm**: If 3 tool calls fire simultaneously and all get 401s, the system will attempt to start 3 OAuth flows for the same server. The queue-and-replay design needs an explicit "auth in progress" lock per server to deduplicate this — otherwise tokens get requested multiple times and callbacks race.

- **Popup blocker kills auto-triggered flow**: A 401 arriving from a background tool call is not a user gesture. Most browsers will block `window.open()` in that path. The popup will either be silently suppressed or shown as a blocked popup notification. This is a likely failure mode in practice.

- **Cross-window postMessage security**: When the `/oauth/callback` page signals the main app, it must validate `event.origin` strictly. If not, any page can inject a fake token. The redirect_uri and origin must be tied to `localhost` with the correct port.

- **Re-registration rate limits**: Some authorization servers rate-limit or reject RFC 7591 registrations. Since credentials are in-memory, every restart re-registers. A busy dev environment (frequent restarts, multiple MCP servers) could hit limits quickly.

- **Refresh token race**: If two requests fire simultaneously when a token is near expiry and both get 401s, both will attempt to refresh. If the server uses refresh token rotation, the second refresh will fail (old token already consumed). The refresh path needs the same "in-progress" lock as initial auth.

- **Redirect URI fragility**: The `/oauth/callback` redirect_uri is registered at dynamic registration time. If the Express server port changes (e.g., env var change, port conflict), the registered URI won't match and auth will fail with no clear error message.

- **Discovery timeout/failure handling**: Trying MCP spec discovery, then falling back to RFC 8414, requires well-defined timeout behaviour. A slow MCP server could cause a multi-second hang on every connect attempt. No timeout target has been specified.

- **Queued request expiry**: Requests queued while auth is in progress have no specified TTL. If the user abandons the popup or auth takes minutes, queued requests will hang indefinitely.

---

**Open Questions for the User**

1. When multiple concurrent requests to the same MCP server all receive 401s, should the system start only one OAuth flow and queue the rest, or is each caller responsible for checking an "auth in progress" flag? Where does this coordination live?

2. Auto-triggering a popup on a background 401 (no user gesture) is reliably blocked by browsers. Should the auto-trigger path instead show an in-app notification/banner that the user must click to open the auth popup, rather than attempting to open it directly?

3. If the user closes the auth popup without completing login, what should happen to the queued requests — fail immediately, or wait for a configurable timeout?

4. Should the `state` parameter be validated server-side in `/oauth/callback` as an additional CSRF check (separate from PKCE), and if so, where is the expected state stored during the flow?

5. Is there a maximum number of MCP servers a user might connect simultaneously? Concurrent OAuth flows for multiple servers (each with their own discovery, registration, and popup) could overlap — is that scenario in scope?

6. What port is the Express server expected to run on? Is it fixed or configurable? The registered `redirect_uri` must match exactly — is there a plan for how the callback URL is constructed and validated?