id: bugs__missing-config-unfriendly-error
overview: Detect missing config.yaml (ENOENT) and show an actionable error message telling the user to copy config.example.yaml
status: done
tasks:
  - task: >
      In server/config.ts loadConfig(), update the catch block (lines 44-47) to check
      if the caught error has code === 'ENOENT'. If so, throw a new Error with message:
      'Config file "<path>" not found. To get started, copy config.example.yaml to config.yaml and customize it.'
      For all other error codes, preserve the existing generic error message unchanged:
      'Failed to read config file "<path>": <original message>'.
    refs:
      - specs/bugs/missing-config-unfriendly-error/design.md
      - specs/bugs/missing-config-unfriendly-error/requirements.md
    status: done
  - task: >
      In server/config.test.ts, update the existing test "throws when config.yaml is missing"
      to assert the error message contains 'copy config.example.yaml to config.yaml' instead of
      the current 'Failed to read config file' assertion. Add a new test case "throws generic
      error for non-ENOENT read failures" that calls loadConfig() with a path that is a directory
      (e.g., use mkdtempSync to create a temp dir and pass its path) and asserts the error message
      contains 'Failed to read config file' but does NOT contain 'copy config.example.yaml'.
      Verify all existing tests still pass.
    refs:
      - specs/bugs/missing-config-unfriendly-error/requirements.md
      - specs/bugs/missing-config-unfriendly-error/design.md
    status: done
