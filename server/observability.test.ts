/**
 * Observability requirement verification tests.
 *
 * Verifies:
 * 1. Server logs MCP connection events (connect/disconnect/failure)
 * 2. No external telemetry or logging service calls
 * 3. Startup failures exit with a clear error message
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readSrc(relPath: string): string {
  return readFileSync(resolve(__dirname, relPath), "utf-8");
}

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...getAllSourceFiles(resolve(dir, entry.name)));
    } else if (
      entry.isFile() &&
      (extname(entry.name) === ".ts") &&
      !entry.name.endsWith(".test.ts") &&
      entry.name !== "security.test.ts" &&
      entry.name !== "observability.test.ts"
    ) {
      files.push(resolve(dir, entry.name));
    }
  }
  return files;
}

describe("Observability: MCP connection logging", () => {
  it("mcp-manager.ts logs connect events", () => {
    const src = readSrc("lib/mcp-manager.ts");
    assert.ok(
      src.includes("console.log") || src.includes("[mcp-manager]"),
      "mcp-manager should log connection events"
    );
  });

  it("index.ts logs connection success and failure at startup", () => {
    const src = readSrc("index.ts");
    assert.ok(
      src.includes("Connected to MCP server") || src.includes("console.log"),
      "index should log successful connections"
    );
    assert.ok(
      src.includes("Could not connect") || src.includes("console.warn"),
      "index should warn on connection failures"
    );
  });

  it("chat route logs tool call errors", () => {
    const src = readSrc("routes/chat.ts");
    assert.ok(
      src.includes("console.error") || src.includes("[chat]"),
      "chat route should log errors"
    );
  });
});

describe("Observability: No external telemetry", () => {
  it("server source files do not import telemetry libraries", () => {
    const telemetryLibs = [
      "datadog",
      "@sentry/",
      "newrelic",
      "opentelemetry",
      "@opentelemetry",
      "honeycomb",
      "logrocket",
      "amplitude",
      "mixpanel",
      "segment",
    ];

    const sourceFiles = getAllSourceFiles(__dirname);
    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8");
      for (const lib of telemetryLibs) {
        assert.ok(
          !content.includes(lib),
          `${file} should not import telemetry library "${lib}"`
        );
      }
    }
  });

  it("server only uses console for logging (no external log services)", () => {
    const loggingServices = [
      "winston",
      "bunyan",
      "pino",
      "log4js",
      "@aws-sdk/client-cloudwatch",
      "papertrail",
    ];

    const sourceFiles = getAllSourceFiles(__dirname);
    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf-8");
      for (const svc of loggingServices) {
        assert.ok(
          !content.includes(svc),
          `${file} should not use external logging service "${svc}"`
        );
      }
    }
  });
});

describe("Observability: Startup failure handling", () => {
  it("index.ts calls process.exit(1) on config load failure", () => {
    const src = readSrc("index.ts");
    assert.ok(
      src.includes("process.exit(1)"),
      "index should call process.exit(1) on config failure"
    );
  });

  it("index.ts logs error message before exiting on config failure", () => {
    const src = readSrc("index.ts");
    assert.ok(
      src.includes("console.error") && src.includes("process.exit(1)"),
      "index should log error then exit"
    );
  });
});
