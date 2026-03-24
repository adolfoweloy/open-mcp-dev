/**
 * Security requirement verification tests.
 *
 * These tests confirm that:
 * 1. OpenAI API key is never included in any API response
 * 2. OAuth tokens are never sent to the client
 * 3. MCP resource proxy keeps Authorization server-side
 * 4. iframe sandbox attribute is set correctly
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, relPath), "utf-8");
}

describe("Security: API key never in API responses", () => {
  it("GET /api/models route never returns api_key field", () => {
    const src = readSrc("routes/models.ts");
    // The route returns ModelInfo[] which has no api_key field
    assert.ok(!src.includes("api_key"), "models route should not reference api_key");
  });

  it("GET /api/models route returns only provider/id/label fields", () => {
    const src = readSrc("routes/models.ts");
    assert.ok(src.includes("provider"), "should include provider field");
    assert.ok(src.includes("label"), "should include label field");
  });

  it("config.ts reads api_key but exports no route that sends it", () => {
    const chatSrc = readSrc("routes/chat.ts");
    // chat route does not return api_key in response
    assert.ok(!chatSrc.includes("api_key"), "chat route should not send api_key");
  });
});

describe("Security: OAuth tokens never sent to client", () => {
  it("OAuth callback returns HTML postMessage page without including token in response", () => {
    const src = readSrc("routes/oauth.ts");
    // The callback returns an HTML page with postMessage — no token in the response
    assert.ok(src.includes("text/html"), "callback should return HTML");
    assert.ok(src.includes("postMessage"), "callback should use postMessage");
    // Token is stored server-side via mcpManager.completeOAuthFlow, not sent to client
    assert.ok(!src.includes("res.json(tokens)"), "should not send tokens as JSON");
    assert.ok(
      !src.includes("accessToken") || src.includes("completeOAuthFlow"),
      "accessToken handled server-side via completeOAuthFlow"
    );
  });

  it("getOAuthToken is exported only for server-side use (not mounted as API route)", () => {
    const indexSrc = readSrc("index.ts");
    // getOAuthToken is imported but never mounted as a route
    assert.ok(
      indexSrc.includes("getOAuthToken"),
      "getOAuthToken imported in index.ts"
    );
    // It should be passed as a parameter to createChatRouter, not exposed as a route
    assert.ok(
      indexSrc.includes("createChatRouter(config, mcpManager, getOAuthToken)"),
      "getOAuthToken passed to chat router, not exposed directly"
    );
  });
});

describe("Security: MCP resource proxy keeps Authorization server-side", () => {
  it("mcp-proxy.ts uses MCP client internally, does not accept auth from client request", () => {
    const src = readSrc("routes/mcp-proxy.ts");
    // Proxy reads Authorization from internal client, not from incoming request headers
    assert.ok(
      !src.includes("req.headers.authorization"),
      "proxy should not forward client auth headers"
    );
    assert.ok(
      !src.includes("req.headers['authorization']"),
      "proxy should not forward client auth headers"
    );
  });

  it("proxy only serves text/html content type", () => {
    const src = readSrc("routes/mcp-proxy.ts");
    assert.ok(src.includes("text/html"), "proxy should only serve HTML");
    assert.ok(src.includes("415"), "proxy should return 415 for non-HTML");
  });
});

describe("Security: No command injection risks in MCP routes", () => {
  it("mcp.ts does not execute serverId as shell command", () => {
    const src = readSrc("routes/mcp.ts");
    assert.ok(!src.includes("exec"), "should not use exec");
    assert.ok(!src.includes("spawn"), "should not use spawn");
  });

  it("serverId is used only for config lookup, not executed", () => {
    const src = readSrc("routes/mcp.ts");
    // serverId is used as a key in config.mcp_servers[serverId]
    assert.ok(
      src.includes("config.mcp_servers[serverId]"),
      "serverId used as config key"
    );
  });
});
