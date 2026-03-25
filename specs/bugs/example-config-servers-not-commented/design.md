# Design: Example MCP servers not commented out

## Root Cause

In `config.example.yaml`, the three example server entries under `mcp_servers:` (lines 19-44) are written as active YAML mappings rather than commented-out documentation. When a user copies the file to `config.yaml`, these entries parse as real configuration.

## Proposed Fix

**File:** `config.example.yaml`

Comment out every line of the three server blocks (`my-stdio-server`, `my-http-server`, `my-oauth-server`) and their nested properties by prefixing each line with `#` followed by a space. Keep `mcp_servers:` itself uncommented so it parses as an empty mapping.

Before:
```yaml
mcp_servers:
  # Example: stdio MCP server
  my-stdio-server:
    type: stdio
    ...
```

After:
```yaml
mcp_servers:
  # Example: stdio MCP server
  # my-stdio-server:
  #   type: stdio
  #   ...
```

The existing `# Example: ...` comment lines stay as-is. Only the YAML key-value lines need the `#` prefix added.

## Test Strategy

- Parse the updated `config.example.yaml` with `js-yaml` and assert that `mcp_servers` is either `null`, `undefined`, or an empty object (`{}`).
- Verify that uncommenting any single server block produces valid YAML that parses with the expected keys.
