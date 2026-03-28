import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ConfigWriter } from "./config-writer.js";
import type { McpServerConfig } from "../config.js";

function makeTempConfig(content: string): string {
  const path = join(tmpdir(), `config-writer-test-${Date.now()}-${Math.random()}.yaml`);
  writeFileSync(path, content, "utf-8");
  return path;
}

const BASE_CONFIG = `
llm:
  openai:
    api_key: test-key
    default_model: gpt-4o
mcp_servers: {}
`.trim();

const STDIO_SERVER: McpServerConfig = {
  type: "stdio",
  command: "node",
  args: ["server.js"],
  env: { DEBUG: "1" },
};

const HTTP_SERVER: McpServerConfig = {
  type: "http",
  url: "http://localhost:8080",
  oauth: false,
};

describe("ConfigWriter", () => {
  let configPath: string;
  let writer: ConfigWriter;

  beforeEach(() => {
    configPath = makeTempConfig(BASE_CONFIG);
    writer = new ConfigWriter(configPath);
  });

  after(() => {
    // cleanup — best-effort
  });

  it("(a) addServer writes new entry and round-trips correctly", async () => {
    await writer.addServer("my-server", STDIO_SERVER);

    const cfg = writer.readYaml();
    assert.deepEqual(cfg.mcp_servers["my-server"], STDIO_SERVER);
    // Non-server sections preserved
    assert.equal(cfg.llm.openai?.api_key, "test-key");
  });

  it("(b) updateServer with rename replaces key preserving other entries", async () => {
    await writer.addServer("old-name", STDIO_SERVER);
    await writer.addServer("other-server", HTTP_SERVER);
    await writer.updateServer("old-name", "new-name", { ...STDIO_SERVER, command: "python" });

    const cfg = writer.readYaml();
    assert.equal("old-name" in cfg.mcp_servers, false, "old key should be removed");
    assert.equal(cfg.mcp_servers["new-name"]?.type, "stdio");
    assert.equal((cfg.mcp_servers["new-name"] as { command: string }).command, "python");
    // Other entry preserved
    assert.equal(cfg.mcp_servers["other-server"]?.type, "http");
  });

  it("(c) removeServer deletes key", async () => {
    await writer.addServer("server-a", STDIO_SERVER);
    await writer.addServer("server-b", HTTP_SERVER);
    await writer.removeServer("server-a");

    const cfg = writer.readYaml();
    assert.equal("server-a" in cfg.mcp_servers, false);
    assert.equal(cfg.mcp_servers["server-b"]?.type, "http");
  });

  it("(d) concurrent addServer calls serialise correctly — no data loss", async () => {
    const servers = ["s1", "s2", "s3", "s4", "s5"];
    await Promise.all(
      servers.map((id) =>
        writer.addServer(id, { type: "stdio", command: `cmd-${id}` })
      )
    );

    const cfg = writer.readYaml();
    for (const id of servers) {
      assert.ok(id in cfg.mcp_servers, `${id} should be present`);
    }
    assert.equal(Object.keys(cfg.mcp_servers).length, servers.length);
  });

  it("(e) readYaml/writeYaml preserves non-server config sections", async () => {
    await writer.addServer("srv", STDIO_SERVER);
    await writer.removeServer("srv");

    const cfg = writer.readYaml();
    assert.equal(cfg.llm.openai?.api_key, "test-key");
    assert.equal(cfg.llm.openai?.default_model, "gpt-4o");
  });

  it("updateServer with same id updates in place", async () => {
    await writer.addServer("srv", STDIO_SERVER);
    const updated: McpServerConfig = { type: "stdio", command: "updated-cmd" };
    await writer.updateServer("srv", "srv", updated);

    const cfg = writer.readYaml();
    assert.equal((cfg.mcp_servers["srv"] as { command: string }).command, "updated-cmd");
  });
});
