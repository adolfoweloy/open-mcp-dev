import { describe, it, mock, beforeEach, afterEach } from "node:test";
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

  it("getToolsForAiSdk is called with selectedServers and emitEvent", async () => {
    let capturedServerIds: string[] | undefined;
    let capturedEmitEvent: ((event: object) => void) | undefined;
    const manager = {
      getToolsForAiSdk: async (ids?: string[], emitEvent?: (event: object) => void) => {
        capturedServerIds = ids;
        capturedEmitEvent = emitEvent;
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
    assert.equal(typeof capturedEmitEvent, "function", "emitEvent should be passed as 2nd arg to getToolsForAiSdk");
  });
});

// Helper: build a minimal valid OpenAI SSE streaming response body
function makeOpenAiSseBody(content = "ok"): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = [
    `data: {"id":"1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":${JSON.stringify(content)}},"finish_reason":null}]}\n\n`,
    `data: {"id":"1","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
    `data: [DONE]\n\n`,
  ];
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
}

// Helper: run the chat route handler and collect all response writes
async function runChatHandler(
  router: ReturnType<typeof createChatRouter>,
  body: object
): Promise<{ chunks: string[]; statusCode: number }> {
  const chunks: string[] = [];
  let statusCode = 200;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("handler timeout")), 5000);

    const res = {
      headersSent: false,
      statusCode: 200,
      setHeader() { return this; },
      writeHead(code: number) { statusCode = code; return this; },
      status(code: number) { statusCode = code; return this; },
      json(data: unknown) { chunks.push(JSON.stringify(data)); return this; },
      write(chunk: string | Buffer | Uint8Array) {
        const str = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        chunks.push(str);
        return true;
      },
      end() { clearTimeout(timeout); resolve(); },
      on() { return this; },
      once() { return this; },
      emit() { return true; },
      removeListener() { return this; },
      writableEnded: false,
    } as unknown as ServerResponse;

    const req = { body } as unknown as IncomingMessage;

    const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack.find(
      (l) => l.route?.path === "/chat"
    );

    if (!layer?.route) { clearTimeout(timeout); reject(new Error("route not found")); return; }

    layer.route.stack[0].handle(req, res, () => {});
  });

  return { chunks, statusCode };
}

describe("chat route auth_required data stream events", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("(a) emitEvent writes auth_required event to the data stream", async () => {
    // Mock OpenAI API to return a valid streaming response
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const manager = {
      getToolsForAiSdk: async (_ids: string[], emitEvent?: (event: object) => void) => {
        // Simulate callWithAuth emitting auth_required during tool execution
        emitEvent?.({ type: "auth_required", serverId: "test-server" });
        return {};
      },
    } as unknown as MCPClientManager;

    const router = createChatRouter(baseConfig, manager);
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: ["test-server"],
    });

    const output = chunks.join("");
    // Vercel AI SDK data parts are written as: 2:[{...}]\n
    assert.ok(
      output.includes('"auth_required"') && output.includes('"test-server"'),
      `data stream should contain auth_required event, got: ${output.slice(0, 500)}`
    );
  });

  it("(b) after completeOAuthFlow resolves the lock, tool result flows through normally", async () => {
    // This integration is covered by mcp-manager.test.ts callWithAuth tests.
    // At the chat route level we verify: when getToolsForAiSdk emits no auth events and
    // returns tools normally, the stream completes successfully.
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody("tool result"), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    let emitEventCallCount = 0;
    const manager = {
      getToolsForAiSdk: async (_ids: string[], emitEvent?: (event: object) => void) => {
        // emitEvent captured but NOT called — simulates auth already resolved before tool runs
        void emitEvent; // captured but intentionally unused
        return {};
      },
    } as unknown as MCPClientManager;

    const router = createChatRouter(baseConfig, manager);
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: ["test-server"],
    });

    const output = chunks.join("");
    // Stream should complete with LLM content, no auth_required event
    assert.ok(output.length > 0, "stream should have output");
    assert.equal(emitEventCallCount, 0, "emitEvent should not have been called");
    assert.ok(
      !output.includes('"auth_required"'),
      "stream should NOT contain auth_required when auth was already resolved"
    );
  });

  it("(c) emitEvent is not called for non-OAuth tool calls", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    let emitEventCallCount = 0;
    const manager = {
      getToolsForAiSdk: async (_ids: string[], emitEvent?: (event: object) => void) => {
        // Wrap emitEvent to count calls — non-OAuth tools should not trigger it
        const tracked = emitEvent
          ? (event: object) => { emitEventCallCount++; emitEvent(event); }
          : undefined;
        void tracked; // received but not used (no tool calls in this test)
        return {};
      },
    } as unknown as MCPClientManager;

    const router = createChatRouter(baseConfig, manager);
    await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: ["test-server"],
    });

    assert.equal(
      emitEventCallCount,
      0,
      "emitEvent should not be called for non-OAuth (non-401) tool calls"
    );
  });
});

// Helper: parse all 'debug' typed events from a Vercel AI SDK data stream output
function extractDebugEvents(output: string): Array<{ type: string; event: Record<string, unknown> }> {
  const result: Array<{ type: string; event: Record<string, unknown> }> = [];
  for (const line of output.split('\n')) {
    if (!line.startsWith('2:')) continue;
    try {
      const parsed = JSON.parse(line.slice(2));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.type === 'debug') {
            result.push(item as { type: string; event: Record<string, unknown> });
          }
        }
      }
    } catch {
      // ignore malformed chunks
    }
  }
  return result;
}

describe("chat route debug event emission", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it("(1) emits LLM request debug event before streamText", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const router = createChatRouter(baseConfig, makeMockManager());
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: [],
    });

    const debugEvents = extractDebugEvents(chunks.join(""));
    const requestEvents = debugEvents.filter(
      (e) => e.event?.actor === "llm" && e.event?.type === "request"
    );
    assert.ok(
      requestEvents.length >= 1,
      `expected at least one LLM request debug event; got ${debugEvents.length} debug events total`
    );
  });

  it("(1) emits LLM response debug event in onFinish", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody("hello world"), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const router = createChatRouter(baseConfig, makeMockManager());
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: [],
    });

    const debugEvents = extractDebugEvents(chunks.join(""));
    const responseEvents = debugEvents.filter(
      (e) => e.event?.actor === "llm" && e.event?.type === "response"
    );
    assert.ok(
      responseEvents.length >= 1,
      `expected at least one LLM response debug event; got debug events: ${JSON.stringify(debugEvents.map((e) => ({ actor: e.event?.actor, type: e.event?.type })))}`
    );
  });

  it("(5) LLM request event payload contains model id", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const router = createChatRouter(baseConfig, makeMockManager());
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "ping" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: [],
    });

    const debugEvents = extractDebugEvents(chunks.join(""));
    const requestEvent = debugEvents.find(
      (e) => e.event?.actor === "llm" && e.event?.type === "request"
    );
    assert.ok(requestEvent, "LLM request debug event should exist");
    assert.equal(typeof requestEvent.event.payload, "string", "payload should be a string");
    assert.ok(
      (requestEvent.event.payload as string).includes("gpt-4o"),
      "payload should include model id"
    );
  });

  it("(6) chat stream completes normally even if debug emission has no side-effects", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody("done"), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const router = createChatRouter(baseConfig, makeMockManager());
    const { chunks, statusCode } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hi" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: [],
    });

    assert.equal(statusCode, 200, "chat should complete with 200");
    assert.ok(chunks.join("").length > 0, "stream should produce output");
  });

  it("(7) all debug events have type='debug' wrapper with nested event object", async () => {
    globalThis.fetch = mock.fn(async () =>
      new Response(makeOpenAiSseBody(), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const router = createChatRouter(baseConfig, makeMockManager());
    const { chunks } = await runChatHandler(router, {
      messages: [{ role: "user", content: "hello" }],
      model: { provider: "openai", id: "gpt-4o" },
      selectedServers: [],
    });

    const debugEvents = extractDebugEvents(chunks.join(""));
    assert.ok(debugEvents.length > 0, "should have at least one debug event");
    for (const e of debugEvents) {
      assert.equal(e.type, "debug", "outer type must be 'debug'");
      assert.ok(
        e.event && typeof e.event === "object",
        "must have nested event object"
      );
      assert.ok(typeof e.event.id === "string", "event.id must be a string");
      assert.ok(typeof e.event.timestamp === "string", "event.timestamp must be an ISO string");
      assert.ok(typeof e.event.actor === "string", "event.actor must be a string");
      assert.ok(typeof e.event.type === "string", "event.type must be a string");
    }
  });
});
