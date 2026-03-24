import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchModels, fetchServers, connectServer, disconnectServer } from "./api";
import type { ModelInfo, McpServerStatus } from "./types";

// We mock the global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

describe("fetchModels", () => {
  it("sends GET /api/models and returns parsed JSON", async () => {
    const models: ModelInfo[] = [
      { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
    ];
    mockFetch.mockResolvedValueOnce(makeResponse(200, models));

    const result = await fetchModels();

    expect(mockFetch).toHaveBeenCalledWith("/api/models");
    expect(result).toEqual(models);
  });

  it("throws on non-2xx response with status info", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, "Internal Server Error"));
    await expect(fetchModels()).rejects.toThrow("HTTP 500");
  });
});

describe("fetchServers", () => {
  it("sends GET /api/mcp/servers and returns parsed JSON", async () => {
    const servers: McpServerStatus[] = [
      { id: "my-server", connected: true, requiresOAuth: false },
    ];
    mockFetch.mockResolvedValueOnce(makeResponse(200, servers));

    const result = await fetchServers();

    expect(mockFetch).toHaveBeenCalledWith("/api/mcp/servers");
    expect(result).toEqual(servers);
  });

  it("throws on 404 with status info", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, "Not Found"));
    await expect(fetchServers()).rejects.toThrow("HTTP 404");
  });
});

describe("connectServer", () => {
  it("sends POST /api/mcp/connect with correct JSON body", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await connectServer("my-server");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mcp/connect",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ serverId: "my-server" }),
      })
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, "server not found"));
    await expect(connectServer("unknown")).rejects.toThrow("HTTP 404");
  });
});

describe("disconnectServer", () => {
  it("sends DELETE /api/mcp/disconnect with correct JSON body", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: true }));

    await disconnectServer("my-server");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mcp/disconnect",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ serverId: "my-server" }),
      })
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, "error"));
    await expect(disconnectServer("srv")).rejects.toThrow("HTTP 500");
  });
});
