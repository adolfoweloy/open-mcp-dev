import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpProxyRouter } from "./mcp-proxy.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

function makeMockClient(
  readResourceResult: Awaited<ReturnType<Client["readResource"]>> | Error
) {
  return {
    readResource: async (_req: { uri: string }) => {
      if (readResourceResult instanceof Error) throw readResourceResult;
      return readResourceResult;
    },
  } as unknown as Client;
}

function makeManager(clientMap: Map<string, Client>): MCPClientManager {
  return {
    getClient: (id: string) => clientMap.get(id),
  } as unknown as MCPClientManager;
}

async function callProxyRoute(
  router: ReturnType<typeof createMcpProxyRouter>,
  serverId: string,
  uri: string | null
) {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: Function }>;
        };
      }>;
    }
  ).stack;

  const layer = stack.find(
    (l) =>
      l.route?.path === "/mcp/resource/:serverId" &&
      l.route.methods["get"]
  );
  assert.ok(layer?.route, "GET /mcp/resource/:serverId route should exist");

  let capturedStatus = 200;
  let capturedBody: unknown;
  let capturedHeaders: Record<string, string> = {};

  const req = {
    params: { serverId },
    query: uri !== null ? { uri } : {},
  } as unknown as IncomingMessage & {
    params: Record<string, string>;
    query: Record<string, string>;
  };

  const res = {
    status(code: number) {
      capturedStatus = code;
      return this;
    },
    json(data: unknown) {
      capturedBody = data;
      return this;
    },
    setHeader(name: string, value: string) {
      capturedHeaders[name] = value;
      return this;
    },
    send(data: string) {
      capturedBody = data;
      return this;
    },
  } as unknown as ServerResponse & {
    status: Function;
    json: Function;
    setHeader: Function;
    send: Function;
  };

  await layer.route.stack[0].handle(req, res, () => {});
  return { status: capturedStatus, body: capturedBody, headers: capturedHeaders };
}

describe("createMcpProxyRouter", () => {
  it("proxies valid HTML resource with correct Content-Type", async () => {
    const client = makeMockClient({
      contents: [{ uri: "mcp://server/page", mimeType: "text/html", text: "<h1>Hello</h1>" }],
    });
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status, body, headers } = await callProxyRoute(router, "myserver", "mcp://server/page");

    assert.equal(status, 200);
    assert.equal(body, "<h1>Hello</h1>");
    assert.equal(headers["Content-Type"], "text/html; charset=utf-8");
  });

  it("returns 400 when uri param is missing", async () => {
    const manager = makeManager(new Map());
    const router = createMcpProxyRouter(manager);

    const { status, body } = await callProxyRoute(router, "myserver", null);

    assert.equal(status, 400);
    assert.ok((body as { error: string }).error.toLowerCase().includes("uri"));
  });

  it("returns 404 when server is not connected", async () => {
    const manager = makeManager(new Map());
    const router = createMcpProxyRouter(manager);

    const { status, body } = await callProxyRoute(router, "unknown", "mcp://server/page");

    assert.equal(status, 404);
    assert.ok((body as { error: string }).error.includes("unknown"));
  });

  it("returns 415 when resource is not HTML", async () => {
    const client = makeMockClient({
      contents: [{ uri: "mcp://server/data", mimeType: "application/json", text: "{}" }],
    });
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status } = await callProxyRoute(router, "myserver", "mcp://server/data");

    assert.equal(status, 415);
  });

  it("returns 415 when no contents are returned", async () => {
    const client = makeMockClient({ contents: [] });
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status } = await callProxyRoute(router, "myserver", "mcp://server/empty");

    assert.equal(status, 415);
  });

  it("returns 401 when MCP server throws a 401 error", async () => {
    const client = makeMockClient(new Error("401 Unauthorized"));
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status } = await callProxyRoute(router, "myserver", "mcp://server/page");

    assert.equal(status, 401);
  });

  it("returns 500 on generic MCP error", async () => {
    const client = makeMockClient(new Error("Connection lost"));
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status, body } = await callProxyRoute(router, "myserver", "mcp://server/page");

    assert.equal(status, 500);
    assert.ok((body as { error: string }).error.includes("Connection lost"));
  });

  it("handles text/html with charset correctly", async () => {
    const client = makeMockClient({
      contents: [
        { uri: "mcp://server/page", mimeType: "text/html; charset=utf-8", text: "<p>ok</p>" },
      ],
    });
    const manager = makeManager(new Map([["myserver", client]]));
    const router = createMcpProxyRouter(manager);

    const { status, body } = await callProxyRoute(router, "myserver", "mcp://server/page");

    assert.equal(status, 200);
    assert.equal(body, "<p>ok</p>");
  });
});
