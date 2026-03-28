import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp, autoConnectServers } from "./index.js";
import type { Config } from "./config.js";
import type { MCPClientManager } from "./lib/mcp-manager.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(
  mcpServers: Config["mcp_servers"] = {},
  llm: Config["llm"] = {}
): Config {
  return { llm, mcp_servers: mcpServers };
}

type ConnectCall = { id: string; connected: boolean };

function makeMcpManager(connectBehavior?: (id: string) => Promise<void>): {
  manager: MCPClientManager;
  calls: ConnectCall[];
} {
  const calls: ConnectCall[] = [];
  const connected = new Set<string>();

  const serverConfigs = new Map();
  const manager: MCPClientManager = {
    connectToServer: async (id: string) => {
      if (connectBehavior) {
        await connectBehavior(id);
      }
      connected.add(id);
      calls.push({ id, connected: true });
    },
    addServer: async (id: string, config: unknown) => {
      if (connectBehavior) {
        await connectBehavior(id);
      }
      serverConfigs.set(id, config);
      connected.add(id);
      calls.push({ id, connected: true });
    },
    disconnectServer: async (id: string) => {
      connected.delete(id);
    },
    isConnected: (id: string) => connected.has(id),
    requiresOAuth: () => false,
    getServerStatuses: () => [],
    getServerConfigs: () => serverConfigs,
    getToolsForAiSdk: async () => ({}),
  } as unknown as MCPClientManager;

  return { manager, calls };
}

function makeReq(method: string, url: string, body?: unknown) {
  return {
    method,
    url,
    headers: { "content-type": "application/json" },
    body,
  } as unknown as IncomingMessage & { body: unknown };
}

function makeRes() {
  const headers: Record<string, string | number | string[]> = {};
  let statusCode = 200;
  let responseBody = "";

  const res = {
    statusCode,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    status(code: number) {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      responseBody = JSON.stringify(body);
      res.end();
    },
    send(body: string) {
      responseBody = body;
      res.end();
    },
    end() {
      /* no-op */
    },
    get statusSent() {
      return statusCode;
    },
    get body() {
      return responseBody;
    },
    get hdrs() {
      return headers;
    },
  } as unknown as ServerResponse;

  return { res, headers, getStatus: () => statusCode, getBody: () => responseBody };
}

// ── createApp() ──────────────────────────────────────────────────────────────

describe("createApp", () => {
  it("mounts GET /api/models and returns 200", async () => {
    const config = makeConfig({}, { openai: { api_key: "k" } });
    const { manager } = makeMcpManager();
    const app = createApp(config, manager);

    await new Promise<void>((resolve) => {
      // Use supertest-style in-process request
      const server = app.listen(0, async () => {
        const port = (server.address() as { port: number }).port;
        try {
          const r = await fetch(`http://localhost:${port}/api/models`);
          assert.equal(r.status, 200);
          const data = (await r.json()) as unknown[];
          assert.ok(Array.isArray(data));
        } finally {
          server.close(() => resolve());
        }
      });
    });
  });

  it("mounts GET /api/mcp/servers and returns 200", async () => {
    const config = makeConfig();
    const { manager } = makeMcpManager();
    const app = createApp(config, manager);

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as { port: number }).port;
        try {
          const r = await fetch(`http://localhost:${port}/api/mcp/servers`);
          assert.equal(r.status, 200);
        } finally {
          server.close(() => resolve());
        }
      });
    });
  });

  it("mounts POST /api/mcp/connect and returns 404 for unknown server", async () => {
    const config = makeConfig();
    const { manager } = makeMcpManager();
    const app = createApp(config, manager);

    await new Promise<void>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as { port: number }).port;
        try {
          const r = await fetch(`http://localhost:${port}/api/mcp/connect`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ serverId: "nonexistent" }),
          });
          assert.equal(r.status, 404);
        } finally {
          server.close(() => resolve());
        }
      });
    });
  });
});

// ── autoConnectServers() ─────────────────────────────────────────────────────

describe("autoConnectServers", () => {
  it("auto-connects non-oauth servers", async () => {
    const config = makeConfig({
      stdio1: { type: "stdio", command: "echo" },
      http1: { type: "http", url: "http://localhost:9999" },
    });
    const { manager, calls } = makeMcpManager();

    await autoConnectServers(config, manager);

    const connectedIds = calls.map((c) => c.id).sort();
    assert.deepEqual(connectedIds, ["http1", "stdio1"]);
  });

  it("skips OAuth http servers at startup", async () => {
    const config = makeConfig({
      oauth_server: { type: "http", url: "http://oauth.example.com", oauth: true },
      regular: { type: "stdio", command: "echo" },
    });
    const { manager, calls } = makeMcpManager();

    await autoConnectServers(config, manager);

    const connectedIds = calls.map((c) => c.id);
    assert.ok(!connectedIds.includes("oauth_server"), "OAuth server should be skipped");
    assert.ok(connectedIds.includes("regular"), "Non-OAuth server should connect");
  });

  it("continues starting even when a connection fails", async () => {
    const config = makeConfig({
      bad_server: { type: "stdio", command: "will-fail" },
      good_server: { type: "stdio", command: "echo" },
    });

    let goodConnected = false;
    const manager: MCPClientManager = {
      connectToServer: async (id: string) => {
        if (id === "bad_server") throw new Error("connection refused");
        goodConnected = true;
      },
      addServer: async (id: string) => {
        if (id === "bad_server") throw new Error("connection refused");
        goodConnected = true;
      },
      disconnectServer: async () => {},
      isConnected: () => false,
      requiresOAuth: () => false,
      getServerStatuses: () => [],
      getServerConfigs: () => new Map(),
      getToolsForAiSdk: async () => ({}),
    } as unknown as MCPClientManager;

    // Should not throw even though bad_server fails
    await assert.doesNotReject(() => autoConnectServers(config, manager));
    assert.ok(goodConnected, "good_server should still connect after bad_server fails");
  });

  it("handles an empty mcp_servers config without error", async () => {
    const config = makeConfig({});
    const { manager, calls } = makeMcpManager();

    await autoConnectServers(config, manager);

    assert.equal(calls.length, 0);
  });
});
