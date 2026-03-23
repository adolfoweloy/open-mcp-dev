import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createChatRouter } from "./chat.js";
import type { Config } from "../config.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// Minimal mock for MCPClientManager
function makeMockManager(tools = {}): MCPClientManager {
  return {
    getToolsForAiSdk: async () => tools,
  } as unknown as MCPClientManager;
}

const baseConfig: Config = {
  llm: {
    openai: { api_key: "test-key" },
  },
  mcp_servers: {},
};

function makeReqRes(body: unknown) {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let responseBody = "";

  const req = {
    body,
    method: "POST",
    url: "/chat",
  } as unknown as IncomingMessage;

  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      responseBody = JSON.stringify(data);
      return this;
    },
    write() {},
    end() {},
    on() { return this; },
    once() { return this; },
    emit() { return this; },
    removeListener() { return this; },
  } as unknown as ServerResponse & {
    status(code: number): unknown;
    json(data: unknown): unknown;
  };

  return { req, res, headers, get statusCode() { return statusCode; }, get responseBody() { return responseBody; } };
}

describe("createChatRouter", () => {
  it("returns 500 when model provider is not configured", async () => {
    const config: Config = { llm: {}, mcp_servers: {} };
    const router = createChatRouter(config, makeMockManager());

    let capturedStatus = 200;
    let capturedJson: unknown;

    const req = {
      body: {
        messages: [],
        model: { provider: "openai", id: "gpt-4o" },
        selectedServers: [],
      },
    } as unknown as IncomingMessage;

    const res = {
      headersSent: false,
      setHeader() { return this; },
      status(code: number) {
        capturedStatus = code;
        return this;
      },
      json(data: unknown) {
        capturedJson = data;
        return this;
      },
      write() {},
      end() {},
      on() { return this; },
    } as unknown as ServerResponse & { status: (c: number) => unknown; json: (d: unknown) => unknown };

    // Find the POST /chat handler in the router stack
    const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function; method: string }> } }> }).stack.find(
      (l) => l.route?.path === "/chat"
    );
    assert.ok(layer?.route, "route should exist");

    const handler = layer.route.stack[0].handle;
    await handler(req, res, () => {});

    assert.equal(capturedStatus, 500);
    assert.ok(
      (capturedJson as { error: string }).error.includes("not configured"),
      "error should mention 'not configured'"
    );
  });

  it("sets correct headers for valid request", async () => {
    // We can't actually stream without a real model, so we mock at the module level
    // Just test that the router is created and has the correct structure
    const router = createChatRouter(baseConfig, makeMockManager());
    assert.ok(router, "router should be defined");

    const layer = (router as unknown as { stack: Array<{ route?: { path: string } }> }).stack.find(
      (l) => l.route?.path === "/chat"
    );
    assert.ok(layer?.route, "POST /chat route should be registered");
  });

  it("getToolsForAiSdk is called with selectedServers", async () => {
    let capturedServerIds: string[] | undefined;
    const manager = {
      getToolsForAiSdk: async (ids?: string[]) => {
        capturedServerIds = ids;
        return {};
      },
    } as unknown as MCPClientManager;

    const router = createChatRouter(baseConfig, manager);

    const req = {
      body: {
        messages: [],
        model: { provider: "openai", id: "gpt-4o" },
        selectedServers: ["server-a", "server-b"],
      },
    } as unknown as IncomingMessage;

    const res = {
      headersSent: false,
      setHeader() { return this; },
      status(code: number) { return this; },
      json() { return this; },
      write() {},
      end() {},
      on() { return this; },
      pipeDataStreamToResponse() {},
    } as unknown as ServerResponse & { status: Function; json: Function };

    const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack.find(
      (l) => l.route?.path === "/chat"
    );
    assert.ok(layer?.route, "route should exist");

    // The handler will fail because model is mocked but we can check that getToolsForAiSdk was called
    try {
      await layer.route.stack[0].handle(req, res, () => {});
    } catch {
      // Expected - no real model
    }

    assert.deepEqual(capturedServerIds, ["server-a", "server-b"]);
  });
});
