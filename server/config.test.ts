import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, getSystemPrompt } from "./config.js";
import type { ModelSelection } from "../shared/types.js";

function withTempFile(content: string, ext = ".yaml"): string {
  const dir = mkdtempSync(join(tmpdir(), "mcp-config-test-"));
  const file = join(dir, `config${ext}`);
  writeFileSync(file, content, "utf-8");
  return file;
}

describe("loadConfig", () => {
  it("loads a fully-specified config", () => {
    const file = withTempFile(`
llm:
  openai:
    api_key: sk-test
    default_model: gpt-4o
    system_prompt: "You are helpful"
  ollama:
    base_url: http://localhost:11434
    system_prompt: "Be concise"
mcp_servers:
  my-stdio:
    type: stdio
    command: npx
    args: ["-y", "some-server"]
    env:
      FOO: bar
    timeout: 30
  my-http:
    type: http
    url: https://example.com/mcp
    oauth: true
    client_id: client123
    client_secret: secret456
    prefer_sse: false
    timeout: 60
`);
    const config = loadConfig(file);
    assert.equal(config.llm.openai?.api_key, "sk-test");
    assert.equal(config.llm.openai?.default_model, "gpt-4o");
    assert.equal(config.llm.openai?.system_prompt, "You are helpful");
    assert.equal(config.llm.ollama?.base_url, "http://localhost:11434");
    assert.equal(config.llm.ollama?.system_prompt, "Be concise");

    const stdio = config.mcp_servers["my-stdio"];
    assert.equal(stdio.type, "stdio");
    if (stdio.type === "stdio") {
      assert.equal(stdio.command, "npx");
      assert.deepEqual(stdio.args, ["-y", "some-server"]);
      assert.deepEqual(stdio.env, { FOO: "bar" });
      assert.equal(stdio.timeout, 30);
    }

    const http = config.mcp_servers["my-http"];
    assert.equal(http.type, "http");
    if (http.type === "http") {
      assert.equal(http.url, "https://example.com/mcp");
      assert.equal(http.oauth, true);
      assert.equal(http.client_id, "client123");
      assert.equal(http.client_secret, "secret456");
      assert.equal(http.prefer_sse, false);
      assert.equal(http.timeout, 60);
    }
  });

  it("loads config with only mcp_servers (no llm section)", () => {
    const file = withTempFile(`
mcp_servers:
  my-server:
    type: stdio
    command: echo
`);
    const config = loadConfig(file);
    assert.equal(config.llm.openai, undefined);
    assert.equal(config.llm.ollama, undefined);
    assert.equal(config.mcp_servers["my-server"].type, "stdio");
  });

  it("loads config with no mcp_servers", () => {
    const file = withTempFile(`
llm:
  openai:
    api_key: sk-test
`);
    const config = loadConfig(file);
    assert.equal(config.llm.openai?.api_key, "sk-test");
    assert.deepEqual(config.mcp_servers, {});
  });

  it("throws when config.yaml is missing", () => {
    assert.throws(
      () => loadConfig("/nonexistent/path/config.yaml"),
      (err: Error) => {
        assert.ok(err.message.includes("copy config.example.yaml to config.yaml"));
        return true;
      }
    );
  });

  it("throws generic error for non-ENOENT read failures", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-config-test-"));
    assert.throws(
      () => loadConfig(dir),
      (err: Error) => {
        assert.ok(err.message.includes("Failed to read config file"));
        assert.ok(!err.message.includes("copy config.example.yaml"));
        return true;
      }
    );
  });

  it("throws on invalid YAML", () => {
    const file = withTempFile("{ invalid yaml: [unclosed");
    assert.throws(
      () => loadConfig(file),
      (err: Error) => {
        assert.ok(err.message.includes("Invalid YAML"));
        return true;
      }
    );
  });

  it("loads config with optional fields absent from openai/ollama", () => {
    const file = withTempFile(`
llm:
  openai:
    api_key: sk-only-key
  ollama: {}
mcp_servers: {}
`);
    const config = loadConfig(file);
    assert.equal(config.llm.openai?.api_key, "sk-only-key");
    assert.equal(config.llm.openai?.default_model, undefined);
    assert.equal(config.llm.openai?.system_prompt, undefined);
  });
});

describe("getSystemPrompt", () => {
  const config = {
    llm: {
      openai: { api_key: "sk-test", system_prompt: "openai prompt" },
      ollama: { system_prompt: "ollama prompt" },
    },
    mcp_servers: {},
  };

  it("returns openai system_prompt for openai provider", () => {
    const sel: ModelSelection = { provider: "openai", id: "gpt-4o" };
    assert.equal(getSystemPrompt(sel, config), "openai prompt");
  });

  it("returns ollama system_prompt for ollama provider", () => {
    const sel: ModelSelection = { provider: "ollama", id: "llama3" };
    assert.equal(getSystemPrompt(sel, config), "ollama prompt");
  });

  it("returns undefined when openai has no system_prompt", () => {
    const cfg = { llm: { openai: { api_key: "sk-test" } }, mcp_servers: {} };
    const sel: ModelSelection = { provider: "openai", id: "gpt-4o" };
    assert.equal(getSystemPrompt(sel, cfg), undefined);
  });

  it("returns undefined when ollama not configured", () => {
    const cfg = { llm: {}, mcp_servers: {} };
    const sel: ModelSelection = { provider: "ollama", id: "llama3" };
    assert.equal(getSystemPrompt(sel, cfg), undefined);
  });
});
