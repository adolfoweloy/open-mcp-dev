# Fix Requirements

## Acceptance Criteria
- When `config.yaml` is missing, the error message includes the text: `copy config.example.yaml to config.yaml`
- The error message is printed to stderr via the existing `[startup]` log prefix
- The server still exits with a non-zero exit code (it should not silently start without config)
- When `config.yaml` exists but contains invalid YAML, the existing error behaviour is preserved unchanged
- When `config.yaml` exists and is valid, startup behaviour is unchanged

## Non-Goals
- Auto-creating `config.yaml` from the example file
- Starting the server with default config when the file is missing
- Changing config file format or location
