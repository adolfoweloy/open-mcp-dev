# Design: missing-config-unfriendly-error

## Root Cause

In `server/config.ts:40-48`, the `loadConfig()` function catches all `readFileSync` errors and wraps them in a generic message: `Failed to read config file "${path}": ${err.message}`. It does not distinguish between ENOENT (file not found) and other filesystem errors (permissions, etc.), so a missing `config.yaml` produces a raw ENOENT error with no remediation guidance.

The startup handler in `server/index.ts:82-92` then logs this error with a `[startup]` prefix and exits, but adds no additional context.

## Proposed Fix

In `server/config.ts`, inside the `catch` block of `loadConfig()` (line 44-47):
- Check if the error code is `ENOENT`
- If ENOENT: throw a new error with an actionable message that includes `copy config.example.yaml to config.yaml`
- If not ENOENT: preserve the existing generic error message unchanged

No changes needed in `server/index.ts` — the startup handler already logs the error message and exits with code 1.

### Files to Change
- `server/config.ts` — `loadConfig()` catch block
- `server/config.test.ts` — update existing "throws when config.yaml is missing" test to assert the new message, add a test for non-ENOENT errors

## Test Strategy

1. Update the existing test case "throws when config.yaml is missing" to assert the error message contains `copy config.example.yaml to config.yaml`
2. Add a test for a non-ENOENT read error (e.g., a path that is a directory instead of a file) to confirm the original generic message is preserved
3. Verify existing tests for valid config and invalid YAML still pass unchanged
