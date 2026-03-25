id: bugs__example-config-servers-not-commented
overview: Comment out example MCP server entries in config.example.yaml so copying the file produces a config with zero active servers
status: todo
tasks:
  - task: >
      In config.example.yaml, comment out all YAML key-value lines for the three example
      server entries (my-stdio-server, my-http-server, my-oauth-server) and their nested
      properties (lines 19-44). Prefix each active YAML line with "# " preserving its
      original indentation after the "#". Leave the existing descriptive comment lines
      (e.g. "# Example: stdio MCP server") unchanged. Keep the top-level "mcp_servers:"
      key uncommented so it parses as an empty mapping. After the edit, copying
      config.example.yaml to config.yaml should result in mcp_servers being null or {}.
      Uncommenting any single server block should produce valid YAML.
    refs:
      - specs/bugs/example-config-servers-not-commented/design.md
      - specs/bugs/example-config-servers-not-commented/requirements.md
    status: todo
  - task: >
      Test the config.example.yaml fix: parse config.example.yaml with js-yaml and assert
      that the mcp_servers key is either null, undefined, or an empty object ({}). Also
      verify that uncommenting the my-stdio-server block (removing leading "# " from its
      lines) results in valid YAML where mcp_servers.my-stdio-server has type "stdio" and
      command "npx". Place the test alongside existing config tests in server/config.test.ts.
    refs:
      - specs/bugs/example-config-servers-not-commented/requirements.md
      - specs/bugs/example-config-servers-not-commented/design.md
    status: todo
