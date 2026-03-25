# Fix Requirements

## Acceptance Criteria
- `loadConfig()` resolves `config.yaml` relative to the project root, not the current working directory
- Running `npm run dev:server` from the project root successfully loads `config.yaml` from the project root
- Running `npm run dev` directly from the `server/` directory also finds `config.yaml` in the project root
- Passing an explicit absolute path to `loadConfig(path)` still works as before (existing tests remain green)
- The friendly "not found" error from the `missing-config-unfriendly-error` fix is preserved when the file genuinely does not exist

## Non-Goals
- Supporting config files in arbitrary locations via CLI flags or environment variables
- Changing the config file name or format
