import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  McpServerStatus,
  ScrubbedMcpServerConfig,
  ServerConfigsResponse,
  AddServerRequest,
  UpdateServerRequest,
} from "../shared/types.js";

// Type-level assertions: these will cause compile errors if the types are wrong.
// Using `satisfies` to validate that constructed objects conform to the types.

describe("McpServerStatus", () => {
  it("includes type and error fields", () => {
    const status: McpServerStatus = {
      id: "my-server",
      connected: true,
      requiresOAuth: false,
      type: "stdio",
    };
    assert.equal(status.type, "stdio");
    assert.equal(status.error, undefined);
  });

  it("accepts error field", () => {
    const status: McpServerStatus = {
      id: "my-server",
      connected: false,
      requiresOAuth: false,
      type: "http",
      error: "Connection refused",
    };
    assert.equal(status.type, "http");
    assert.equal(status.error, "Connection refused");
  });

  it("type field accepts stdio", () => {
    const status: McpServerStatus = {
      id: "s",
      connected: false,
      requiresOAuth: false,
      type: "stdio",
    };
    assert.equal(status.type, "stdio");
  });

  it("type field accepts http", () => {
    const status: McpServerStatus = {
      id: "h",
      connected: true,
      requiresOAuth: true,
      type: "http",
    };
    assert.equal(status.type, "http");
  });
});

describe("ScrubbedMcpServerConfig discriminated union", () => {
  it("stdio variant has command and no OAuth fields", () => {
    const config: ScrubbedMcpServerConfig = {
      type: "stdio",
      command: "npx",
      args: ["-y", "some-server"],
      env: { KEY: "value" },
      timeout: 30,
    };
    assert.equal(config.type, "stdio");
    if (config.type === "stdio") {
      assert.equal(config.command, "npx");
      assert.deepEqual(config.args, ["-y", "some-server"]);
      assert.deepEqual(config.env, { KEY: "value" });
      assert.equal(config.timeout, 30);
    }
  });

  it("stdio variant minimal (command only)", () => {
    const config: ScrubbedMcpServerConfig = {
      type: "stdio",
      command: "echo",
    };
    assert.equal(config.type, "stdio");
    if (config.type === "stdio") {
      assert.equal(config.command, "echo");
      assert.equal(config.args, undefined);
      assert.equal(config.env, undefined);
    }
  });

  it("http variant has url and boolean has_* flags", () => {
    const config: ScrubbedMcpServerConfig = {
      type: "http",
      url: "https://example.com/mcp",
      timeout: 60,
      prefer_sse: true,
      oauth: {
        client_id: "my-client",
        has_client_secret: true,
        has_access_token: false,
        has_refresh_token: false,
      },
    };
    assert.equal(config.type, "http");
    if (config.type === "http") {
      assert.equal(config.url, "https://example.com/mcp");
      assert.equal(config.prefer_sse, true);
      assert.equal(config.oauth?.client_id, "my-client");
      assert.equal(config.oauth?.has_client_secret, true);
      assert.equal(config.oauth?.has_access_token, false);
      assert.equal(config.oauth?.has_refresh_token, false);
    }
  });

  it("http variant minimal (url only)", () => {
    const config: ScrubbedMcpServerConfig = {
      type: "http",
      url: "https://example.com/mcp",
    };
    assert.equal(config.type, "http");
    if (config.type === "http") {
      assert.equal(config.url, "https://example.com/mcp");
      assert.equal(config.oauth, undefined);
      assert.equal(config.prefer_sse, undefined);
    }
  });

  it("http variant does NOT include raw sensitive fields", () => {
    // Compile-time check: ScrubbedMcpServerConfig http variant should not have
    // client_secret, access_token, refresh_token fields.
    // At runtime, verify that constructing an http config only has has_* flags.
    const config: ScrubbedMcpServerConfig = {
      type: "http",
      url: "https://example.com/mcp",
      oauth: {
        client_id: "cid",
        has_client_secret: true,
        has_access_token: true,
        has_refresh_token: true,
      },
    };
    if (config.type === "http" && config.oauth) {
      // has_* flags present
      assert.equal(typeof config.oauth.has_client_secret, "boolean");
      assert.equal(typeof config.oauth.has_access_token, "boolean");
      assert.equal(typeof config.oauth.has_refresh_token, "boolean");
      // Raw secret fields should NOT be properties on the scrubbed type
      assert.ok(!("client_secret" in config.oauth), "client_secret must not be in scrubbed config");
      assert.ok(!("access_token" in config.oauth), "access_token must not be in scrubbed config");
      assert.ok(!("refresh_token" in config.oauth), "refresh_token must not be in scrubbed config");
    }
  });
});

describe("ServerConfigsResponse", () => {
  it("is a Record of ScrubbedMcpServerConfig", () => {
    const response: ServerConfigsResponse = {
      "my-stdio": { type: "stdio", command: "npx" },
      "my-http": { type: "http", url: "https://example.com/mcp" },
    };
    assert.equal(Object.keys(response).length, 2);
    assert.equal(response["my-stdio"].type, "stdio");
    assert.equal(response["my-http"].type, "http");
  });
});

describe("AddServerRequest", () => {
  it("contains id and config", () => {
    const req: AddServerRequest = {
      id: "new-server",
      config: { type: "stdio", command: "echo" },
    };
    assert.equal(req.id, "new-server");
    assert.equal(req.config.type, "stdio");
  });
});

describe("UpdateServerRequest", () => {
  it("contains optional newId and config", () => {
    const req: UpdateServerRequest = {
      config: { type: "http", url: "https://example.com/mcp" },
    };
    assert.equal(req.newId, undefined);
    assert.equal(req.config.type, "http");
  });

  it("accepts newId for rename", () => {
    const req: UpdateServerRequest = {
      newId: "renamed-server",
      config: { type: "stdio", command: "echo" },
    };
    assert.equal(req.newId, "renamed-server");
  });
});
