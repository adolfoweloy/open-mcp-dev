# Bug: loadConfig() fails when CWD is not the project root

## Description
`loadConfig()` in `server/config.ts` defaults to the relative path `"config.yaml"`, which resolves against the current working directory. When the server is started via `npm run dev:server` (which delegates to the `server` workspace), npm runs `tsx watch index.ts` with CWD set to `server/`. This causes `readFileSync("config.yaml")` to look for `server/config.yaml` instead of the project root's `config.yaml`.

## Symptoms
The server fails to start with:
```
[startup] Failed to load config.yaml: Config file "config.yaml" not found. To get started, copy config.example.yaml to config.yaml and customize it.
```
even though `config.yaml` exists in the project root.

## Reproduction Steps
1. Place a valid `config.yaml` in the project root (alongside `config.example.yaml`).
2. Run `npm run dev:server` from the project root.
3. Observe the startup error about missing config.

## Expected Behaviour
The server loads `config.yaml` from the project root regardless of which workspace or subdirectory `npm` sets as the CWD.

## Actual Behaviour
The server looks for `config.yaml` relative to `server/` (the workspace CWD) and reports it as missing.

## Area Affected
`server/config.ts` — `loadConfig()` function (line 40), path resolution.
