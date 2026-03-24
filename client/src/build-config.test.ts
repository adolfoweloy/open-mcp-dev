/**
 * Build config tests.
 *
 * These tests verify vite.config.ts settings and build output
 * by reading and inspecting the configuration directly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("vite.config.ts", () => {
  it("exists at the client root", () => {
    expect(existsSync(resolve(root, "vite.config.ts"))).toBe(true);
  });

  it("configures /api proxy to localhost:3000", () => {
    const content = readFileSync(resolve(root, "vite.config.ts"), "utf-8");
    expect(content).toContain("/api");
    expect(content).toContain("localhost:3000");
  });

  it("uses @vitejs/plugin-react", () => {
    const content = readFileSync(resolve(root, "vite.config.ts"), "utf-8");
    expect(content).toContain("@vitejs/plugin-react");
  });

  it("sets outDir to dist", () => {
    const content = readFileSync(resolve(root, "vite.config.ts"), "utf-8");
    expect(content).toContain("dist");
  });
});

describe("client/tsconfig.json", () => {
  it("exists", () => {
    expect(existsSync(resolve(root, "tsconfig.json"))).toBe(true);
  });

  it("sets jsx to react-jsx", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf-8"));
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
  });

  it("enables strict mode", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf-8"));
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("has path alias for shared/", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf-8"));
    const paths = tsconfig.compilerOptions.paths as Record<string, string[]>;
    expect(paths).toBeDefined();
    expect(Object.keys(paths).some((k) => k.startsWith("shared"))).toBe(true);
  });
});

describe("client/index.html", () => {
  it("exists", () => {
    expect(existsSync(resolve(root, "index.html"))).toBe(true);
  });

  it("has charset utf-8", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content.toLowerCase()).toContain("utf-8");
  });

  it("has viewport meta tag", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain("viewport");
  });

  it("references main.tsx as script", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain("main.tsx");
  });

  it("has #root div", () => {
    const content = readFileSync(resolve(root, "index.html"), "utf-8");
    expect(content).toContain('id="root"');
  });
});

describe("vite build output", () => {
  it("dist/index.html exists after build", () => {
    expect(existsSync(resolve(root, "dist", "index.html"))).toBe(true);
  });

  it("dist/assets directory contains JS bundle", () => {
    const assetsDir = resolve(root, "dist", "assets");
    const { readdirSync } = require("fs");
    const files = readdirSync(assetsDir) as string[];
    const jsFiles = files.filter((f: string) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
  });
});
