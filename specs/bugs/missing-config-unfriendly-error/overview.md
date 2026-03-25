# Bug: Unfriendly error when config.yaml is missing on fresh checkout

## Description
When running `npm run dev:server` on a fresh checkout, the server fails to start with a raw ENOENT error because `config.yaml` does not exist. The error message does not tell the user how to fix the problem (i.e. copy `config.example.yaml` to `config.yaml`).

## Symptoms
- Server crashes immediately on startup
- Console shows: `[startup] Failed to load config.yaml: Failed to read config file "config.yaml": ENOENT: no such file or directory, open 'config.yaml'`
- No guidance on how to resolve the issue

## Reproduction Steps
1. Clone the repository (fresh checkout)
2. Run `npm install`
3. Run `npm run dev:server`

## Expected Behaviour
When `config.yaml` is missing, the server should print a clear, actionable error message telling the user to copy `config.example.yaml` to `config.yaml` and customize it.

## Actual Behaviour
The server prints a raw ENOENT filesystem error with no guidance on how to fix it.

## Area Affected
`server/config.ts` — `loadConfig()` function (line 40–48)
`server/index.ts` — startup error handler (line 82–88)
