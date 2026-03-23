/**
 * Scaffold tests: validates root package.json workspace config and config.example.yaml
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

test("package.json has workspaces config", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.ok(Array.isArray(pkg.workspaces), "workspaces should be an array");
  assert.ok(pkg.workspaces.includes("server"), 'workspaces should include "server"');
  assert.ok(pkg.workspaces.includes("client"), 'workspaces should include "client"');
});

test("workspace directories exist with package.json", () => {
  assert.ok(
    existsSync(resolve(root, "server/package.json")),
    "server/package.json must exist for workspace resolution"
  );
  assert.ok(
    existsSync(resolve(root, "client/package.json")),
    "client/package.json must exist for workspace resolution"
  );
});

test("workspace package names are correct", () => {
  const server = JSON.parse(readFileSync(resolve(root, "server/package.json"), "utf8"));
  const client = JSON.parse(readFileSync(resolve(root, "client/package.json"), "utf8"));
  assert.equal(server.name, "mcp-chat-server");
  assert.equal(client.name, "mcp-chat-client");
});

test("config.example.yaml is valid YAML", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  assert.doesNotThrow(() => parseYaml(raw), "config.example.yaml must be valid YAML");
});

test("config.example.yaml contains all required top-level fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  assert.ok(config.llm, "must have llm section");
  assert.ok(config.mcp_servers, "must have mcp_servers section");
});

test("config.example.yaml llm.openai has all documented fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  const openai = config.llm?.openai;
  assert.ok(openai, "must have llm.openai section");
  assert.ok("api_key" in openai, "llm.openai must have api_key");
  assert.ok("default_model" in openai, "llm.openai must have default_model");
  assert.ok("system_prompt" in openai, "llm.openai must have system_prompt");
});

test("config.example.yaml llm.ollama has all documented fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  const ollama = config.llm?.ollama;
  assert.ok(ollama, "must have llm.ollama section");
  assert.ok("base_url" in ollama, "llm.ollama must have base_url");
  assert.ok("system_prompt" in ollama, "llm.ollama must have system_prompt");
});

test("config.example.yaml mcp_servers has stdio variant with all fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  const servers = config.mcp_servers;
  assert.ok(servers, "must have mcp_servers");

  const stdioServer = Object.values(servers).find((s) => s.type === "stdio");
  assert.ok(stdioServer, "must have at least one stdio server example");
  assert.ok("command" in stdioServer, "stdio server must have command");
  assert.ok("args" in stdioServer, "stdio server must have args");
  assert.ok("env" in stdioServer, "stdio server must have env");
  assert.ok("timeout" in stdioServer, "stdio server must have timeout");
});

test("config.example.yaml mcp_servers has http variant with all fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  const servers = config.mcp_servers;

  const httpServer = Object.values(servers).find((s) => s.type === "http" && !s.oauth);
  assert.ok(httpServer, "must have at least one plain http server example");
  assert.ok("url" in httpServer, "http server must have url");
  assert.ok("prefer_sse" in httpServer, "http server must have prefer_sse");
  assert.ok("timeout" in httpServer, "http server must have timeout");
});

test("config.example.yaml mcp_servers has oauth http variant with all fields", () => {
  const raw = readFileSync(resolve(root, "config.example.yaml"), "utf8");
  const config = parseYaml(raw);
  const servers = config.mcp_servers;

  const oauthServer = Object.values(servers).find((s) => s.type === "http" && s.oauth === true);
  assert.ok(oauthServer, "must have at least one oauth http server example");
  assert.ok("url" in oauthServer, "oauth server must have url");
  assert.ok("oauth" in oauthServer, "oauth server must have oauth flag");
  assert.ok("client_id" in oauthServer, "oauth server must have client_id");
  assert.ok("client_secret" in oauthServer, "oauth server must have client_secret");
  assert.ok("prefer_sse" in oauthServer, "oauth server must have prefer_sse");
  assert.ok("timeout" in oauthServer, "oauth server must have timeout");
});
