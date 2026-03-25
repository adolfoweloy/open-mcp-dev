id: bugs__config-not-found-wrong-cwd
overview: Anchor the default config.yaml path to the project root using import.meta.dirname so loadConfig() works regardless of CWD
status: done
tasks:
  - task: >
      In server/config.ts, add `import { resolve } from "path"` to the imports.
      At module level (after imports, before the type declarations), add:
      `const DEFAULT_CONFIG_PATH = resolve(import.meta.dirname, "..", "config.yaml");`
      Then change the function signature from `loadConfig(path = "config.yaml")`
      to `loadConfig(path = DEFAULT_CONFIG_PATH)`. This ensures the default path
      always resolves to `<project-root>/config.yaml` (one directory above
      `server/`) regardless of `process.cwd()`. Callers passing explicit absolute
      paths (like all existing tests) are unaffected.
    refs:
      - specs/bugs/config-not-found-wrong-cwd/design.md
      - specs/bugs/config-not-found-wrong-cwd/requirements.md
    status: done
  - task: >
      In server/config.test.ts, add a test "default path resolves relative to
      project root, not CWD" that verifies loadConfig() without arguments does NOT
      resolve against process.cwd(). The test should: (1) save the original CWD
      with process.cwd(), (2) change CWD to os.tmpdir() using process.chdir(),
      (3) call loadConfig() with no arguments in a try/catch, (4) restore the
      original CWD in a finally block, (5) assert that the caught error message
      includes the absolute project-root path (containing "/config.yaml" but NOT
      starting with the tmpdir path), proving the function looked in the right
      place. This confirms the fix works when CWD differs from the project root.
      All existing tests must continue to pass.
    refs:
      - specs/bugs/config-not-found-wrong-cwd/requirements.md
      - specs/bugs/config-not-found-wrong-cwd/design.md
    status: done
