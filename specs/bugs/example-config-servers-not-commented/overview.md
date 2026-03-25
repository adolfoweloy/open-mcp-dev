# Bug: Example MCP servers in config.example.yaml are not commented out

## Description
The `config.example.yaml` file ships with three example `mcp_servers` entries (`my-stdio-server`, `my-http-server`, `my-oauth-server`) that are **not commented out**. When a user copies the file to `config.yaml` to get started, those entries become active configuration even though they point to non-existent servers.

## Symptoms
Users who copy `config.example.yaml` as-is and only want to test the LLM chat (no MCP servers) get unnecessary, non-functional server entries in their config.

## Reproduction Steps
1. Clone the repo on a fresh checkout.
2. `cp config.example.yaml config.yaml`
3. Fill in only the `llm` section (e.g. an OpenAI key).
4. Start the app — the config now includes three dummy MCP servers the user never intended to enable.

## Expected Behaviour
The individual server entries under `mcp_servers:` should be commented out so that copying the example file produces a working config with **zero** MCP servers by default. The examples remain visible as documentation.

## Actual Behaviour
The example server entries are uncommented and become active configuration on copy.

## Area Affected
`config.example.yaml` — the example configuration file.
