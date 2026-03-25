# Design: loadConfig() fails when CWD is not the project root

## Root Cause

`loadConfig()` in `server/config.ts` uses a default parameter of `"config.yaml"` — a relative path that `readFileSync` resolves against `process.cwd()`. When npm runs the `server` workspace script (`npm run dev:server`), CWD is set to `server/`, so the file lookup becomes `server/config.yaml` instead of `<project-root>/config.yaml`.

## Proposed Fix

Anchor the default config path to the source file's own location using `import.meta.dirname` (available in Node 21.2+ and the project uses ESM modules).

In `server/config.ts`:

1. Compute the default path at module level:
   ```ts
   import { resolve } from "path";
   const DEFAULT_CONFIG_PATH = resolve(import.meta.dirname, "..", "config.yaml");
   ```
2. Change the function signature default:
   ```ts
   export function loadConfig(path = DEFAULT_CONFIG_PATH): Config {
   ```

Since `config.ts` lives in `server/`, `resolve(import.meta.dirname, "..", "config.yaml")` always points to `<project-root>/config.yaml` regardless of CWD.

Explicit absolute paths passed by callers (including all existing tests) are unaffected because they bypass the default.

## Files Changed

- `server/config.ts` — add `resolve` import, compute `DEFAULT_CONFIG_PATH`, update function signature default

## Test Strategy

- Add a test that creates a config file in a temp directory, then calls `loadConfig()` (no argument) from a different CWD, and verifies it still loads the project-root-anchored default (or fails with the expected path in the error message, proving it looked in the right place).
- Verify all existing tests still pass — they use explicit absolute paths and should be unaffected.
