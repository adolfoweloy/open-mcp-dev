# Fix Requirements

## Acceptance Criteria
- The `mcp_servers:` key remains present and uncommented in `config.example.yaml`
- All individual server entries (`my-stdio-server`, `my-http-server`, `my-oauth-server`) and their nested properties are commented out with `#`
- The commented entries remain readable as documentation (proper indentation preserved after `#`)
- Copying `config.example.yaml` to `config.yaml` without edits results in an empty `mcp_servers` section (parsed as `{}` or `null`)
- A user can uncomment a single server block and have it be valid YAML

## Non-Goals
- Changing the structure or content of the example server entries
- Adding new example entries or removing existing ones
- Modifying how `mcp_servers` is loaded or defaulted in application code
