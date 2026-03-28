import { describe, it, expect } from "vitest";
import { serializePayload } from "./types";

describe("serializePayload", () => {
  it("returns unchanged output for payload under 10240 chars", () => {
    const data = { key: "value", nested: { a: 1, b: 2 } };
    const result = serializePayload(data);
    expect(result).toBe(JSON.stringify(data, null, 2));
    expect(result.length).toBeLessThanOrEqual(10_240);
    expect(result).not.toContain("[TRUNCATED]");
  });

  it("truncates payload over 10240 chars to exactly 10240 chars plus newline+[TRUNCATED] suffix", () => {
    const bigObject = { data: "x".repeat(20_000) };
    const result = serializePayload(bigObject);
    const raw = JSON.stringify(bigObject, null, 2);
    expect(raw.length).toBeGreaterThan(10_240);
    expect(result).toBe(raw.slice(0, 10_240) + "\n[TRUNCATED]");
    // The part before the suffix is exactly 10240 chars
    const withoutSuffix = result.slice(0, result.indexOf("\n[TRUNCATED]"));
    expect(withoutSuffix.length).toBe(10_240);
  });

  it("returns empty string for undefined input", () => {
    expect(serializePayload(undefined)).toBe("");
  });

  it("returns empty string for null input", () => {
    expect(serializePayload(null)).toBe("");
  });

  it("handles circular references without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => serializePayload(obj)).not.toThrow();
    expect(serializePayload(obj)).toBe("");
  });

  it("serializes a number", () => {
    expect(serializePayload(42)).toBe("42");
  });

  it("serializes a string", () => {
    expect(serializePayload("hello")).toBe('"hello"');
  });

  it("serializes an array", () => {
    expect(serializePayload([1, 2, 3])).toBe("[\n  1,\n  2,\n  3\n]");
  });
});
