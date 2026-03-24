import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpRouter } from "./mcp.js";
import type { Config } from "../config.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { McpServerStatus } from "../../shared/types.js";

function makeConfig(overrides: Partial<Config["mcp_servers"]> = {}): Config {
  return {
    llm: {},
    mcp_servers: {
      stdio_server: { type: "stdio", command: "echo" },
      http_server: { type: "http", url: "http://localhost:9999" },
      ...overrides,
    },
  } as Config;
}

function makeMcpManager(overrides: Partial<MCPClientManager> = {}): MCPClientManager {
  const connected = new Set<string>();
  return {
    connectToServer: async (id: string) => { connected.add(id); },
    disconnectServer: async (id: string) => { connected.delete(id); },
    isConnected: (id: string) => connected.has(id),
    requiresOAuth: (_id: string, _configs: Record<string, unknown>) => false,
    getServerStatuses: (configs: Record<string, unknown>): McpServerStatus[] =>
      Object.keys(configs).map((id) => ({
        id,
        connected: connected.has(id),
        requiresOAuth: false,
      })),
    getToolsForAiSdk: async () => ({}),
    ...overrides,
  } as unknown as MCPClientManager;
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
  const res = {
    status(code: number) { capturedStatus = code; return res; },
    json(data: unknown) { capturedJson = data; return res; },
    getStatus: () => capturedStatus,
    getJson: () => capturedJson,
  };
  return res;
}

async function callRoute(
  router: ReturnType<typeof createMcpRouter>,
  method: string,
  path: string,
  body?: unknown
) {
  const stack = (router as unknown as { stack: RouterStack }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method.toLowerCase()]);
  assert.ok(layer?.route, `${method} ${path} route should exist`);

  const req = {
    method,
    url: path,
    body: body ?? {},
    params: {},
    get: (_h: string) => undefined,
  } as unknown as IncomingMessage & { body: unknown };

  const res = makeRes();

  await layer.route.stack[0].handle(req, res, () => {});
  return { status: res.getStatus(), json: res.getJson() };
}

async function callParamRoute(
  router: ReturnType<typeof createMcpRouter>,
  method: string,
  routePath: string,
  params: Record<string, string>,
  options: { body?: unknown; host?: string } = {}
) {
  const stack = (router as unknown as { stack: RouterStack }).stack;
  const layer = stack.find(
    (l) => l.route?.path === routePath && l.route.methods[method.toLowerCase()]
  );
  assert.ok(layer?.route, `${method} ${routePath} route should exist`);

  const host = options.host ?? "localhost:3000";
  const req = {
    method,
    url: routePath,
    body: options.body ?? {},
    params,
    get: (h: string) => (h.toLowerCase() === "host" ? host : undefined),
  } as unknown as IncomingMessage & { body: unknown; params: Record<string, string> };

  const res = makeRes();

  await layer.route.stack[0].handle(req, res, () => {});
  return { status: res.getStatus(), json: res.getJson() };
}

describe("createMcpRouter", () => {
  describe("GET /mcp/servers", () => {
    it("returns correct server statuses", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      const router = createMcpRouter(config, manager);

      const { status, json } = await callRoute(router, "GET", "/mcp/servers");

      assert.equal(status, 200);
      const statuses = json as McpServerStatus[];
      assert.ok(Array.isArray(statuses));
      assert.equal(statuses.length, 2);
      assert.ok(statuses.some((s) => s.id === "stdio_server"));
      assert.ok(statuses.some((s) => s.id === "http_server"));
      assert.ok(statuses.every((s) => s.connected === false));
    });

    it("shows connected=true for connected servers", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      // Pre-connect stdio_server
      await manager.connectToServer("stdio_server", config.mcp_servers["stdio_server"]!);
      const router = createMcpRouter(config, manager);

      const { json } = await callRoute(router, "GET", "/mcp/servers");
      const statuses = json as McpServerStatus[];
      const s = statuses.find((x) => x.id === "stdio_server");
      assert.ok(s);
      assert.equal(s.connected, true);
    });
  });

  describe("POST /mcp/connect", () => {
    it("connects a known server and returns 200", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      const router = createMcpRouter(config, manager);

      const { status, json } = await callRoute(router, "POST", "/mcp/connect", { serverId: "stdio_server" });

      assert.equal(status, 200);
      assert.deepEqual(json, { ok: true });
      assert.equal(manager.isConnected("stdio_server"), true);
    });

    it("returns 404 for unknown server", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      const router = createMcpRouter(config, manager);

      const { status, json } = await callRoute(router, "POST", "/mcp/connect", { serverId: "unknown" });

      assert.equal(status, 404);
      assert.ok((json as { error: string }).error.includes("unknown"));
    });

    it("returns 500 on connection error", async () => {
      const config = makeConfig();
      const manager = makeMcpManager({
        connectToServer: async () => { throw new Error("Connection refused"); },
      });
      const router = createMcpRouter(config, manager);

      const { status, json } = await callRoute(router, "POST", "/mcp/connect", { serverId: "stdio_server" });

      assert.equal(status, 500);
      assert.ok((json as { error: string }).error.includes("Connection refused"));
    });
  });

  describe("DELETE /mcp/disconnect", () => {
    it("disconnects a connected server and returns 200", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      await manager.connectToServer("stdio_server", config.mcp_servers["stdio_server"]!);
      assert.equal(manager.isConnected("stdio_server"), true);

      const router = createMcpRouter(config, manager);
      const { status, json } = await callRoute(router, "DELETE", "/mcp/disconnect", { serverId: "stdio_server" });

      assert.equal(status, 200);
      assert.deepEqual(json, { ok: true });
      assert.equal(manager.isConnected("stdio_server"), false);
    });

    it("returns 404 for unknown server", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      const router = createMcpRouter(config, manager);

      const { status, json } = await callRoute(router, "DELETE", "/mcp/disconnect", { serverId: "unknown" });

      assert.equal(status, 404);
      assert.ok((json as { error: string }).error.includes("unknown"));
    });
  });

  describe("POST /mcp/:serverId/connect", () => {
    it("returns 404 for unknown serverId", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "unknown_server" }
      );

      assert.equal(status, 404);
      assert.ok((json as { error: string }).error.includes("unknown_server"));
    });

    it("returns 200 connected when already connected", async () => {
      const config = makeConfig();
      const manager = makeMcpManager();
      await manager.connectToServer("http_server", config.mcp_servers["http_server"]!);
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "http_server" }
      );

      assert.equal(status, 200);
      assert.deepEqual(json, { status: "connected" });
    });

    it("connects non-OAuth server and returns 200", async () => {
      const config = makeConfig();
      let connectCalled = false;
      const manager = makeMcpManager({
        connectToServer: async (id: string) => { connectCalled = true; },
        isConnected: (_id: string) => false,
      });
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "stdio_server" }
      );

      assert.equal(status, 200);
      assert.deepEqual(json, { status: "connected" });
      assert.equal(connectCalled, true);
    });

    it("returns 500 when non-OAuth connectToServer fails", async () => {
      const config = makeConfig();
      const manager = makeMcpManager({
        connectToServer: async () => { throw new Error("Connection refused"); },
        isConnected: (_id: string) => false,
      });
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "stdio_server" }
      );

      assert.equal(status, 500);
      assert.ok((json as { error: string }).error.includes("Connection refused"));
    });

    it("calls prepareOAuthFlow for OAuth server and returns 202 with authUrl", async () => {
      const config = makeConfig({
        oauth_server: { type: "http", url: "http://mcp.example.com", oauth: true },
      });
      const prepareCalledWith: { serverId: string; serverUrl: string; port: number }[] = [];
      const manager = makeMcpManager({
        isConnected: (_id: string) => false,
        prepareOAuthFlow: async (serverId: string, serverUrl: string, port: number) => {
          prepareCalledWith.push({ serverId, serverUrl, port });
          return "https://auth.example.com/authorize?client_id=abc";
        },
      });
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "oauth_server" },
        { host: "localhost:3000" }
      );

      assert.equal(status, 202);
      assert.deepEqual(json, {
        status: "auth_required",
        authUrl: "https://auth.example.com/authorize?client_id=abc",
      });
      assert.equal(prepareCalledWith.length, 1);
      assert.equal(prepareCalledWith[0]!.serverId, "oauth_server");
      assert.equal(prepareCalledWith[0]!.serverUrl, "http://mcp.example.com");
      assert.equal(prepareCalledWith[0]!.port, 3000);
    });

    it("returns 500 when prepareOAuthFlow throws (discovery error)", async () => {
      const config = makeConfig({
        oauth_server: { type: "http", url: "http://mcp.example.com", oauth: true },
      });
      const manager = makeMcpManager({
        isConnected: (_id: string) => false,
        prepareOAuthFlow: async () => {
          throw new Error("OAuth discovery failed");
        },
      });
      const router = createMcpRouter(config, manager);

      const { status, json } = await callParamRoute(
        router, "POST", "/mcp/:serverId/connect",
        { serverId: "oauth_server" }
      );

      assert.equal(status, 500);
      assert.ok((json as { error: string }).error.includes("OAuth discovery failed"));
    });
  });
});
