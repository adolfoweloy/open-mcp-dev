/**
 * Tests for the client entry point and index.html.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("index.html", () => {
  it("has charset utf-8", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content.toLowerCase()).toContain("utf-8");
  });

  it("has viewport meta tag", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain("viewport");
  });

  it("has title MCP Chat", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain("MCP Chat");
  });

  it("has #root div", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain('id="root"');
  });

  it("references main.tsx as module script", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain("main.tsx");
    expect(content).toContain('type="module"');
  });
});

describe("main.tsx", () => {
  it("imports StrictMode from react", () => {
    const content = readFileSync(resolve(__dirname, "main.tsx"), "utf-8");
    expect(content).toContain("StrictMode");
  });

  it("mounts App component", () => {
    const content = readFileSync(resolve(__dirname, "main.tsx"), "utf-8");
    expect(content).toContain("App");
  });

  it("uses createRoot (React 19 API)", () => {
    const content = readFileSync(resolve(__dirname, "main.tsx"), "utf-8");
    expect(content).toContain("createRoot");
  });
});
