import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createConfigRouter } from "./config.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { ConfigWriter } from "../lib/config-writer.js";
import type { McpServerConfig } from "../config.js";
import type { McpServerStatus, ScrubbedMcpServerConfig, ServerConfigsResponse } from "../../shared/types.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMcpManager(
  initialConfigs: Record<string, McpServerConfig> = {},
  overrides: Partial<MCPClientManager> = {}
): MCPClientManager {
  const serverConfigs = new Map<string, McpServerConfig>(Object.entries(initialConfigs));
  const connected = new Set<string>();

  const manager: Partial<MCPClientManager> = {
    getServerConfigs: () => serverConfigs,
    getServerStatuses: (): McpServerStatus[] =>
      Array.from(serverConfigs.entries()).map(([id, cfg]) => ({
        id,
        connected: connected.has(id),
        requiresOAuth: cfg.type === "http" && (cfg as { oauth?: boolean }).oauth === true,
        type: cfg.type,
      })),
    addServer: async (id: string, config: McpServerConfig) => {
      serverConfigs.set(id, config);
      connected.add(id);
    },
    updateServer: async (oldId: string, newId: string, config: McpServerConfig) => {
      serverConfigs.delete(oldId);
      connected.delete(oldId);
      serverConfigs.set(newId, config);
      connected.add(newId);
    },
    removeServer: async (id: string) => {
      serverConfigs.delete(id);
      connected.delete(id);
    },
    ...overrides,
  };

  return manager as unknown as MCPClientManager;
}

function makeConfigWriter(overrides: Partial<ConfigWriter> = {}): ConfigWriter {
  return {
    addServer: async () => {},
    updateServer: async () => {},
    removeServer: async () => {},
    readYaml: () => { throw new Error("not implemented"); },
    writeYaml: () => {},
    ...overrides,
  } as unknown as ConfigWriter;
}

type RouterStack = Array<{
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: Function }>;
  };
}>;

function makeRes() {
  let capturedStatus = 200;
  let capturedJson: unknown;
  let sentEmpty = false;
  const res = {
    status(code: number) { capturedStatus = code; return res; },
    json(data: unknown) { capturedJson = data; return res; },
    send() { sentEmpty = true; return res; },
    getStatus: () => capturedStatus,
    getJson: () => capturedJson,
    wasSentEmpty: () => sentEmpty,
  };
  return res;
}

async function callRoute(
  router: ReturnType<typeof createConfigRouter>,
  method: string,
  path: string,
  body?: unknown,
  params: Record<string, string> = {}
) {
  const stack = (router as unknown as { stack: RouterStack }).stack;
  const layer = stack.find(
    (l) => l.route?.path === path && l.route.methods[method.toLowerCase()]
  );
  assert.ok(layer?.route, `${method} ${path} route should exist`);

  const req = {
    method,
    url: path,
    body: body ?? {},
    params,
    get: (_h: string) => undefined,
  };

  const res = makeRes();
  await layer.route.stack[0].handle(req, res, () => {});
  return { status: res.getStatus(), json: res.getJson(), empty: res.wasSentEmpty() };
}

// ── GET /config/servers ───────────────────────────────────────────────────────

describe("GET /config/servers", () => {
  it("returns empty object when no servers", async () => {
    const manager = makeMcpManager();
    const writer = makeConfigWriter();
    const router = createConfigRouter(manager, writer);

    const { status, json } = await callRoute(router, "GET", "/config/servers");
    assert.equal(status, 200);
    assert.deepEqual(json, {});
  });

  it("returns scrubbed stdio config", async () => {
    const manager = makeMcpManager({
      my_stdio: { type: "stdio", command: "npx", args: ["-y", "some-server"], env: { KEY: "val" } },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { json } = await callRoute(router, "GET", "/config/servers");
    const configs = json as ServerConfigsResponse;
    assert.ok("my_stdio" in configs);
    const cfg = configs["my_stdio"] as ScrubbedMcpServerConfig;
    assert.equal(cfg.type, "stdio");
    if (cfg.type === "stdio") {
      assert.equal(cfg.command, "npx");
      assert.deepEqual(cfg.args, ["-y", "some-server"]);
      assert.deepEqual(cfg.env, { KEY: "val" });
    }
  });

  it("returns scrubbed http config — no raw secrets", async () => {
    const manager = makeMcpManager({
      my_http: {
        type: "http",
        url: "http://example.com",
        client_id: "cid",
        client_secret: "supersecret_xyzzy",
        access_token: "rawAccessTokenValue_xyzzy",
        refresh_token: "rawRefreshTokenValue_xyzzy",
        prefer_sse: true,
      },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { json } = await callRoute(router, "GET", "/config/servers");
    const raw = JSON.stringify(json);

    // Security: no raw secret values
    assert.ok(!raw.includes("supersecret_xyzzy"), "client_secret must not appear in response");
    assert.ok(!raw.includes("rawAccessTokenValue_xyzzy"), "access_token must not appear in response");
    assert.ok(!raw.includes("rawRefreshTokenValue_xyzzy"), "refresh_token must not appear in response");

    const configs = json as ServerConfigsResponse;
    const cfg = configs["my_http"];
    assert.ok(cfg && cfg.type === "http");
    if (cfg && cfg.type === "http") {
      assert.ok(cfg.oauth);
      assert.equal(cfg.oauth!.client_id, "cid");
      assert.equal(cfg.oauth!.has_client_secret, true);
      assert.equal(cfg.oauth!.has_access_token, true);
      assert.equal(cfg.oauth!.has_refresh_token, true);
      assert.equal(cfg.prefer_sse, true);
    }
  });

  it("sets has_* flags to false when secrets are absent", async () => {
    const manager = makeMcpManager({
      my_http: { type: "http", url: "http://example.com", client_id: "cid" },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { json } = await callRoute(router, "GET", "/config/servers");
    const configs = json as ServerConfigsResponse;
    const cfg = configs["my_http"];
    assert.ok(cfg && cfg.type === "http" && cfg.oauth);
    if (cfg && cfg.type === "http" && cfg.oauth) {
      assert.equal(cfg.oauth.has_client_secret, false);
      assert.equal(cfg.oauth.has_access_token, false);
      assert.equal(cfg.oauth.has_refresh_token, false);
    }
  });
});

// ── POST /config/servers ─────────────────────────────────────────────────────

describe("POST /config/servers", () => {
  it("creates a new stdio server and returns 201", async () => {
    const manager = makeMcpManager();
    const writer = makeConfigWriter();
    const router = createConfigRouter(manager, writer);

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      id: "new_server",
      config: { type: "stdio", command: "node", args: ["server.js"] },
    });

    assert.equal(status, 201);
    const body = json as { id: string; status: McpServerStatus };
    assert.equal(body.id, "new_server");
    assert.ok(body.status);
    assert.equal(body.status.id, "new_server");
  });

  it("returns 400 when server ID already exists", async () => {
    const manager = makeMcpManager({
      existing: { type: "stdio", command: "echo" },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      id: "existing",
      config: { type: "stdio", command: "echo" },
    });

    assert.equal(status, 400);
    assert.ok((json as { error: string }).error.includes("already exists"));
  });

  it("returns 422 when id is missing", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      config: { type: "stdio", command: "echo" },
    });

    assert.equal(status, 422);
    assert.ok((json as { error: string }).error.includes("Validation error"));
  });

  it("returns 422 when config type is invalid", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      id: "new",
      config: { type: "ftp", url: "ftp://example.com" },
    });

    assert.equal(status, 422);
    assert.ok((json as { error: string }).error.includes("Validation error"));
  });

  it("returns 422 when stdio command is missing", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      id: "new",
      config: { type: "stdio" },
    });

    assert.equal(status, 422);
    assert.ok((json as { error: string }).error.includes("command"));
  });

  it("returns 422 when http url is missing", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(router, "POST", "/config/servers", {
      id: "new",
      config: { type: "http" },
    });

    assert.equal(status, 422);
    assert.ok((json as { error: string }).error.includes("url"));
  });

  it("calls configWriter.addServer and mcpManager.addServer", async () => {
    const writerCalls: Array<{ id: string; config: McpServerConfig }> = [];
    const managerCalls: Array<{ id: string; config: McpServerConfig }> = [];
    const manager = makeMcpManager({}, {
      addServer: async (id, config) => { managerCalls.push({ id, config }); },
    });
    const writer = makeConfigWriter({
      addServer: async (id, config) => { writerCalls.push({ id, config }); },
    });
    const router = createConfigRouter(manager, writer);

    await callRoute(router, "POST", "/config/servers", {
      id: "srv",
      config: { type: "http", url: "http://example.com" },
    });

    assert.equal(writerCalls.length, 1);
    assert.equal(writerCalls[0]!.id, "srv");
    assert.equal(managerCalls.length, 1);
    assert.equal(managerCalls[0]!.id, "srv");
  });
});

// ── PUT /config/servers/:id ───────────────────────────────────────────────────

describe("PUT /config/servers/:id", () => {
  it("updates a server and returns 200", async () => {
    const manager = makeMcpManager({
      my_server: { type: "stdio", command: "old_cmd" },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(
      router, "PUT", "/config/servers/:id",
      { config: { type: "stdio", command: "new_cmd" } },
      { id: "my_server" }
    );

    assert.equal(status, 200);
    const body = json as { id: string; status: McpServerStatus };
    assert.equal(body.id, "my_server");
  });

  it("returns 404 for unknown server", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(
      router, "PUT", "/config/servers/:id",
      { config: { type: "stdio", command: "cmd" } },
      { id: "nonexistent" }
    );

    assert.equal(status, 404);
    assert.ok((json as { error: string }).error.includes("not found"));
  });

  it("renames server when newId provided", async () => {
    const writerCalls: Array<{ oldId: string; newId: string }> = [];
    const managerCalls: Array<{ oldId: string; newId: string }> = [];
    const manager = makeMcpManager(
      { old_server: { type: "stdio", command: "cmd" } },
      {
        updateServer: async (oldId, newId, _config) => {
          managerCalls.push({ oldId, newId });
        },
      }
    );
    const writer = makeConfigWriter({
      updateServer: async (oldId, newId, _config) => {
        writerCalls.push({ oldId, newId });
      },
    });
    const router = createConfigRouter(manager, writer);

    const { status } = await callRoute(
      router, "PUT", "/config/servers/:id",
      { newId: "new_server", config: { type: "stdio", command: "cmd" } },
      { id: "old_server" }
    );

    assert.equal(status, 200);
    assert.equal(writerCalls[0]!.oldId, "old_server");
    assert.equal(writerCalls[0]!.newId, "new_server");
    assert.equal(managerCalls[0]!.oldId, "old_server");
    assert.equal(managerCalls[0]!.newId, "new_server");
  });

  it("returns 400 when newId conflicts with existing server", async () => {
    const manager = makeMcpManager({
      server_a: { type: "stdio", command: "cmd_a" },
      server_b: { type: "stdio", command: "cmd_b" },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(
      router, "PUT", "/config/servers/:id",
      { newId: "server_b", config: { type: "stdio", command: "cmd_a" } },
      { id: "server_a" }
    );

    assert.equal(status, 400);
    assert.ok((json as { error: string }).error.includes("already exists"));
  });

  it("preserves sensitive fields when null sentinel sent", async () => {
    let mergedConfig: McpServerConfig | undefined;
    const manager = makeMcpManager(
      {
        srv: {
          type: "http",
          url: "http://example.com",
          client_secret: "existing_secret",
          access_token: "existing_token",
          refresh_token: "existing_refresh",
        },
      },
      {
        updateServer: async (_oldId, _newId, config) => {
          mergedConfig = config;
        },
      }
    );
    const router = createConfigRouter(manager, makeConfigWriter());

    await callRoute(
      router, "PUT", "/config/servers/:id",
      {
        config: {
          type: "http",
          url: "http://example.com",
          client_secret: null,
          access_token: null,
          refresh_token: null,
        },
      },
      { id: "srv" }
    );

    assert.ok(mergedConfig);
    if (mergedConfig && mergedConfig.type === "http") {
      assert.equal(mergedConfig.client_secret, "existing_secret");
      assert.equal(mergedConfig.access_token, "existing_token");
      assert.equal(mergedConfig.refresh_token, "existing_refresh");
    }
  });

  it("clears sensitive fields when empty string sent", async () => {
    let mergedConfig: McpServerConfig | undefined;
    const manager = makeMcpManager(
      {
        srv: {
          type: "http",
          url: "http://example.com",
          client_secret: "existing_secret",
        },
      },
      {
        updateServer: async (_oldId, _newId, config) => {
          mergedConfig = config;
        },
      }
    );
    const router = createConfigRouter(manager, makeConfigWriter());

    await callRoute(
      router, "PUT", "/config/servers/:id",
      {
        config: {
          type: "http",
          url: "http://example.com",
          client_secret: "",
        },
      },
      { id: "srv" }
    );

    assert.ok(mergedConfig);
    if (mergedConfig && mergedConfig.type === "http") {
      assert.equal(mergedConfig.client_secret, "");
    }
  });
});

// ── DELETE /config/servers/:id ────────────────────────────────────────────────

describe("DELETE /config/servers/:id", () => {
  it("deletes a server and returns 204", async () => {
    const manager = makeMcpManager({
      my_server: { type: "stdio", command: "echo" },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, empty } = await callRoute(
      router, "DELETE", "/config/servers/:id",
      undefined,
      { id: "my_server" }
    );

    assert.equal(status, 204);
    assert.equal(empty, true);
  });

  it("returns 404 for unknown server", async () => {
    const manager = makeMcpManager();
    const router = createConfigRouter(manager, makeConfigWriter());

    const { status, json } = await callRoute(
      router, "DELETE", "/config/servers/:id",
      undefined,
      { id: "nonexistent" }
    );

    assert.equal(status, 404);
    assert.ok((json as { error: string }).error.includes("not found"));
  });

  it("calls configWriter.removeServer and mcpManager.removeServer", async () => {
    const writerCalls: string[] = [];
    const managerCalls: string[] = [];
    const manager = makeMcpManager(
      { srv: { type: "stdio", command: "echo" } },
      {
        removeServer: async (id) => { managerCalls.push(id); },
      }
    );
    const writer = makeConfigWriter({
      removeServer: async (id) => { writerCalls.push(id); },
    });
    const router = createConfigRouter(manager, writer);

    await callRoute(router, "DELETE", "/config/servers/:id", undefined, { id: "srv" });

    assert.equal(writerCalls[0], "srv");
    assert.equal(managerCalls[0], "srv");
  });
});

// ── Security: GET never exposes raw secrets ───────────────────────────────────

describe("Security: GET /config/servers never exposes raw secrets", () => {
  it("does not expose raw secrets regardless of input config", async () => {
    const secretValues = {
      client_secret: "secret_xyzzy_CLIENT_SECRET",
      access_token: "secret_xyzzy_ACCESS",
      refresh_token: "secret_xyzzy_REFRESH",
    };
    const manager = makeMcpManager({
      evil_server: {
        type: "http",
        url: "http://example.com",
        client_id: "cid",
        ...secretValues,
      },
    });
    const router = createConfigRouter(manager, makeConfigWriter());

    const { json } = await callRoute(router, "GET", "/config/servers");
    const raw = JSON.stringify(json);

    for (const [key, val] of Object.entries(secretValues)) {
      assert.ok(
        !raw.includes(val),
        `${key} value must never appear in response`
      );
    }
  });
});
