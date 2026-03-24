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

async function callRoute(
  router: ReturnType<typeof createMcpRouter>,
  method: string,
  path: string,
  body?: unknown
) {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method.toLowerCase()]);
  assert.ok(layer?.route, `${method} ${path} route should exist`);

  let capturedStatus = 200;
  let capturedJson: unknown;

  const req = {
    method,
    url: path,
    body: body ?? {},
  } as unknown as IncomingMessage & { body: unknown };

  const res = {
    status(code: number) { capturedStatus = code; return this; },
    json(data: unknown) { capturedJson = data; return this; },
  } as unknown as ServerResponse & { status: Function; json: Function };

  await layer.route.stack[0].handle(req, res, () => {});
  return { status: capturedStatus, json: capturedJson };
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
});
