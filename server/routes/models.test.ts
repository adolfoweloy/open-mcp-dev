import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";

// We need to mock listOllamaModels before importing the router
// Use dynamic import with module mocking

const OPENAI_MODEL_IDS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

async function invokeHandler(router: ReturnType<typeof import("./models.js")["createModelsRouter"]>) {
  const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: Function }> } }> }).stack.find(
    (l) => l.route?.path === "/models"
  );
  assert.ok(layer?.route, "GET /models route should exist");

  let capturedStatus = 200;
  let capturedJson: unknown;

  const req = { method: "GET", url: "/models" } as unknown as IncomingMessage;
  const res = {
    status(code: number) { capturedStatus = code; return this; },
    json(data: unknown) { capturedJson = data; return this; },
  } as unknown as ServerResponse & { status: Function; json: Function };

  await layer.route.stack[0].handle(req, res, () => {});
  return { status: capturedStatus, json: capturedJson };
}

describe("createModelsRouter", () => {
  it("returns OpenAI models when only openai is configured", async () => {
    const { createModelsRouter } = await import("./models.js");
    const config = { llm: { openai: { api_key: "test" } }, mcp_servers: {} };
    const router = createModelsRouter(config as Parameters<typeof createModelsRouter>[0]);
    const { status, json } = await invokeHandler(router);

    assert.equal(status, 200);
    const models = json as Array<{ provider: string; id: string }>;
    assert.ok(Array.isArray(models));
    assert.ok(models.length > 0);
    assert.ok(models.every((m) => m.provider === "openai"));
    for (const id of OPENAI_MODEL_IDS) {
      assert.ok(models.some((m) => m.id === id), `should include ${id}`);
    }
  });

  it("returns empty array when neither openai nor ollama is configured", async () => {
    const { createModelsRouter } = await import("./models.js");
    const config = { llm: {}, mcp_servers: {} };
    const router = createModelsRouter(config as Parameters<typeof createModelsRouter>[0]);
    const { status, json } = await invokeHandler(router);

    assert.equal(status, 200);
    assert.deepEqual(json, []);
  });

  it("returns OpenAI models first, then Ollama models when both configured", async () => {
    // Patch global fetch for this test
    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/tags")) {
        return new Response(
          JSON.stringify({ models: [{ name: "llama3" }, { name: "mistral" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url);
    };

    try {
      // Re-import to get fresh module (cache may apply, but logic is tested)
      const { createModelsRouter } = await import("./models.js");
      const config = {
        llm: {
          openai: { api_key: "test" },
          ollama: { base_url: "http://localhost:11434" },
        },
        mcp_servers: {},
      };
      const router = createModelsRouter(config as Parameters<typeof createModelsRouter>[0]);
      const { status, json } = await invokeHandler(router);

      assert.equal(status, 200);
      const models = json as Array<{ provider: string; id: string }>;
      assert.ok(Array.isArray(models));

      const openaiModels = models.filter((m) => m.provider === "openai");
      const ollamaModels = models.filter((m) => m.provider === "ollama");
      assert.ok(openaiModels.length > 0, "should have openai models");
      assert.ok(ollamaModels.length > 0, "should have ollama models");

      // OpenAI models come first
      const firstOllamaIdx = models.findIndex((m) => m.provider === "ollama");
      const lastOpenaiIdx = models.map((m) => m.provider).lastIndexOf("openai");
      assert.ok(lastOpenaiIdx < firstOllamaIdx, "openai models should come before ollama");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns empty array when ollama fetch fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("Network error");
    };

    try {
      const { createModelsRouter } = await import("./models.js");
      const config = {
        llm: { ollama: { base_url: "http://localhost:11434" } },
        mcp_servers: {},
      };
      const router = createModelsRouter(config as Parameters<typeof createModelsRouter>[0]);
      const { status, json } = await invokeHandler(router);

      assert.equal(status, 200);
      assert.deepEqual(json, [], "should return empty array on fetch failure");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns only ollama models when only ollama is configured", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/tags")) {
        return new Response(
          JSON.stringify({ models: [{ name: "llama3" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url);
    };

    try {
      const { createModelsRouter } = await import("./models.js");
      const config = {
        llm: { ollama: { base_url: "http://localhost:11434" } },
        mcp_servers: {},
      };
      const router = createModelsRouter(config as Parameters<typeof createModelsRouter>[0]);
      const { status, json } = await invokeHandler(router);

      assert.equal(status, 200);
      const models = json as Array<{ provider: string; id: string }>;
      assert.ok(models.every((m) => m.provider === "ollama"), "all models should be ollama");
      assert.ok(models.some((m) => m.id === "llama3"), "should include llama3");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
