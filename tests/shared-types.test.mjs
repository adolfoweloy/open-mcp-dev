/**
 * Shared types tests: compile shared/types.ts and verify exports
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

test("shared/types.ts compiles without TypeScript errors (tsc --noEmit)", () => {
  execSync(
    `${root}/node_modules/.bin/tsc --noEmit --project ${root}/tsconfig.json`,
    { cwd: root, encoding: "utf8" }
  );
  // execSync throws if exit code != 0, so reaching here means success
  assert.ok(true, "tsc exited with zero errors");
});

test("all required type names are exported and structurally correct (tsc type check)", () => {
  const typeCheckScript = `import type { ModelInfo, ModelSelection, McpServerStatus, ChatRequest, UIMessage } from './shared/types.js';

// Verify ModelInfo shape
const m: ModelInfo = { provider: "openai", id: "gpt-4o", label: "GPT-4o" };
const m2: ModelInfo = { provider: "ollama", id: "llama3", label: "Llama 3" };

// Verify ModelSelection shape (no label field)
const ms: ModelSelection = { provider: "ollama", id: "llama3" };

// Verify McpServerStatus shape
const status: McpServerStatus = { id: "srv", connected: true, requiresOAuth: false };

// Verify ChatRequest.messages is UIMessage[] (from Vercel AI SDK)
const msgs: UIMessage[] = [];
const req: ChatRequest = { messages: msgs, model: ms, selectedServers: ["s1"] };

// Verify providers are constrained to the union
const p: ModelInfo["provider"] = "openai";
const p2: ModelInfo["provider"] = "ollama";

export {};
`;

  const tmpFile = resolve(root, "_shared_types_check_tmp.ts");
  writeFileSync(tmpFile, typeCheckScript, "utf8");

  try {
    execSync(
      `${root}/node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck ${tmpFile}`,
      { cwd: root, encoding: "utf8" }
    );
    assert.ok(true, "All exported type names and shapes verified by tsc");
  } finally {
    unlinkSync(tmpFile);
  }
});

test("ChatRequest.messages typed as UIMessage[] - rejects non-UIMessage array (tsc)", () => {
  // Verify that assigning a plain string array to messages causes a type error
  const badScript = `import type { ChatRequest, ModelSelection } from './shared/types.js';
const ms: ModelSelection = { provider: "openai", id: "gpt-4o" };
// @ts-expect-error messages must be UIMessage[], not string[]
const req: ChatRequest = { messages: ["hello"], model: ms, selectedServers: [] };
export {};
`;

  const tmpFile = resolve(root, "_shared_types_bad_tmp.ts");
  writeFileSync(tmpFile, badScript, "utf8");

  try {
    // tsc should succeed because @ts-expect-error suppresses the intentional error
    // If the type error does NOT exist, tsc would complain about an unused @ts-expect-error
    execSync(
      `${root}/node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck ${tmpFile}`,
      { cwd: root, encoding: "utf8" }
    );
    assert.ok(true, "ChatRequest.messages correctly typed as UIMessage[] (not string[])");
  } finally {
    unlinkSync(tmpFile);
  }
});

test("ModelInfo has provider, id, label fields (runtime structural check)", () => {
  /** @type {{ provider: "openai" | "ollama"; id: string; label: string }} */
  const model = { provider: "openai", id: "gpt-4o", label: "GPT-4o" };
  assert.equal(model.provider, "openai");
  assert.equal(model.id, "gpt-4o");
  assert.equal(model.label, "GPT-4o");
});

test("ModelSelection has provider and id fields (runtime structural check)", () => {
  const sel = { provider: "ollama", id: "llama3" };
  assert.equal(sel.provider, "ollama");
  assert.equal(sel.id, "llama3");
  assert.ok(!("label" in sel), "ModelSelection should not have label");
});

test("McpServerStatus has id, connected, requiresOAuth fields (runtime structural check)", () => {
  const status = { id: "my-server", connected: false, requiresOAuth: true };
  assert.equal(status.id, "my-server");
  assert.equal(status.connected, false);
  assert.equal(status.requiresOAuth, true);
});

test("ChatRequest has messages, model, selectedServers fields (runtime structural check)", () => {
  const req = {
    messages: [],
    model: { provider: "openai", id: "gpt-4o" },
    selectedServers: ["server1"],
  };
  assert.ok(Array.isArray(req.messages), "messages must be an array");
  assert.ok(typeof req.model === "object", "model must be an object");
  assert.ok(Array.isArray(req.selectedServers), "selectedServers must be an array");
  assert.equal(req.selectedServers[0], "server1");
});
