import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { listOllamaModels, normaliseOllamaBaseUrl } from "./ollama.js";

describe("normaliseOllamaBaseUrl", () => {
  it("appends /api when missing", () => {
    assert.equal(
      normaliseOllamaBaseUrl("http://localhost:11434"),
      "http://localhost:11434/api"
    );
  });

  it("strips trailing slash and appends /api", () => {
    assert.equal(
      normaliseOllamaBaseUrl("http://localhost:11434/"),
      "http://localhost:11434/api"
    );
  });

  it("keeps /api when already present", () => {
    assert.equal(
      normaliseOllamaBaseUrl("http://localhost:11434/api"),
      "http://localhost:11434/api"
    );
  });

  it("strips trailing slash from /api/", () => {
    assert.equal(
      normaliseOllamaBaseUrl("http://localhost:11434/api/"),
      "http://localhost:11434/api"
    );
  });

  it("works with custom host and port", () => {
    assert.equal(
      normaliseOllamaBaseUrl("http://custom:8080"),
      "http://custom:8080/api"
    );
  });
});

describe("listOllamaModels", () => {
  it("parses /api/tags response correctly", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () =>
      Response.json({ models: [{ name: "llama3" }, { name: "mistral" }] })
    ) as typeof fetch;

    try {
      const models = await listOllamaModels("http://localhost:11434");
      assert.equal(models.length, 2);
      assert.deepEqual(models[0], {
        provider: "ollama",
        id: "llama3",
        label: "llama3",
      });
      assert.deepEqual(models[1], {
        provider: "ollama",
        id: "mistral",
        label: "mistral",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns [] on network error without throwing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Network error");
    }) as typeof fetch;

    try {
      const models = await listOllamaModels("http://localhost:11434");
      assert.deepEqual(models, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns [] on non-ok response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(
      async () => new Response("Internal Server Error", { status: 500 })
    ) as typeof fetch;

    try {
      const models = await listOllamaModels("http://localhost:11434");
      assert.deepEqual(models, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("times out gracefully after 5 seconds", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(
      (_, opts: { signal?: AbortSignal } = {}) =>
        new Promise<Response>((_, reject) => {
          const signal = opts?.signal;
          if (signal) {
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          }
        })
    ) as typeof fetch;

    try {
      const models = await listOllamaModels("http://localhost:11434");
      assert.deepEqual(models, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
