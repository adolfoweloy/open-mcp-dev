import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createModel } from "./models.js";
import type { Config } from "../config.js";

const baseConfig: Config = {
  llm: {
    openai: { api_key: "test-key" },
    ollama: { base_url: "http://localhost:11434/api" },
  },
  mcp_servers: {},
};

describe("createModel", () => {
  it("returns a model for openai provider", () => {
    const model = createModel({ provider: "openai", id: "gpt-4o" }, baseConfig);
    assert.ok(model, "model should be defined");
  });

  it("returns a model for ollama provider", () => {
    const model = createModel(
      { provider: "ollama", id: "llama3" },
      baseConfig
    );
    assert.ok(model, "model should be defined");
  });

  it("uses default ollama base url when not configured", () => {
    const config: Config = { llm: {}, mcp_servers: {} };
    const model = createModel({ provider: "ollama", id: "llama3" }, config);
    assert.ok(model, "model should be defined");
  });

  it("throws when openai provider is not configured", () => {
    const config: Config = { llm: {}, mcp_servers: {} };
    assert.throws(
      () => createModel({ provider: "openai", id: "gpt-4o" }, config),
      /OpenAI provider is not configured/
    );
  });
});
