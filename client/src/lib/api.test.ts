import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchModels,
  fetchServers,
  connectServer,
  disconnectServer,
  startOAuthConnect,
  fetchOAuthAuthUrl,
  fetchServerConfigs,
  addServer,
  updateServer,
  deleteServer,
} from "./api";
import type { ModelInfo, McpServerStatus } from "./types";
import type { ServerConfigsResponse, McpServerConfig } from "../../../shared/types";

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
      { id: "my-server", connected: true, requiresOAuth: false, type: "stdio" as const },
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

describe("startOAuthConnect", () => {
  it("sends POST /api/mcp/{serverId}/connect with correct path", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { status: "connected" })
    );

    await startOAuthConnect("my-server");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mcp/my-server/connect",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns { status: 'auth_required', authUrl } on 202", async () => {
    const payload = {
      status: "auth_required",
      authUrl: "https://auth.example.com/authorize?foo=bar",
    };
    mockFetch.mockResolvedValueOnce(makeResponse(202, payload));

    const result = await startOAuthConnect("srv");

    expect(result).toEqual(payload);
  });

  it("encodes special characters in serverId", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { status: "connected" })
    );

    await startOAuthConnect("my server/x");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mcp/my%20server%2Fx/connect",
      expect.anything()
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, "Not Found"));
    await expect(startOAuthConnect("unknown")).rejects.toThrow("HTTP 404");
  });
});

describe("fetchOAuthAuthUrl", () => {
  it("sends GET /api/mcp/{serverId}/auth/url", async () => {
    const payload = { authUrl: "https://auth.example.com/authorize?baz=1" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, payload));

    await fetchOAuthAuthUrl("my-server");

    expect(mockFetch).toHaveBeenCalledWith("/api/mcp/my-server/auth/url");
  });

  it("returns { authUrl } on 200", async () => {
    const payload = { authUrl: "https://auth.example.com/authorize?baz=1" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, payload));

    const result = await fetchOAuthAuthUrl("my-server");

    expect(result).toEqual(payload);
  });

  it("encodes special characters in serverId", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, { authUrl: "https://example.com" })
    );

    await fetchOAuthAuthUrl("my server/x");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/mcp/my%20server%2Fx/auth/url"
    );
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, "error"));
    await expect(fetchOAuthAuthUrl("srv")).rejects.toThrow("HTTP 500");
  });
});

describe("fetchServerConfigs", () => {
  it("sends GET /api/config/servers and returns parsed JSON", async () => {
    const configs: ServerConfigsResponse = {
      "my-stdio": { type: "stdio", command: "node", args: ["server.js"] },
      "my-http": { type: "http", url: "http://localhost:3000" },
    };
    mockFetch.mockResolvedValueOnce(makeResponse(200, configs));

    const result = await fetchServerConfigs();

    expect(mockFetch).toHaveBeenCalledWith("/api/config/servers");
    expect(result).toEqual(configs);
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, "Internal Server Error"));
    await expect(fetchServerConfigs()).rejects.toThrow("HTTP 500");
  });
});

describe("addServer", () => {
  const stdioConfig: McpServerConfig = { type: "stdio", command: "node", args: ["server.js"] };

  it("sends POST /api/config/servers with correct JSON body", async () => {
    const status: McpServerStatus = { id: "new-server", connected: false, requiresOAuth: false, type: "stdio" };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { id: "new-server", status }));

    await addServer("new-server", stdioConfig);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: "new-server", config: stdioConfig }),
      })
    );
  });

  it("returns { id, status } on 201", async () => {
    const status: McpServerStatus = { id: "new-server", connected: false, requiresOAuth: false, type: "stdio" };
    mockFetch.mockResolvedValueOnce(makeResponse(201, { id: "new-server", status }));

    const result = await addServer("new-server", stdioConfig);

    expect(result).toEqual({ id: "new-server", status });
  });

  it("throws on 400 (duplicate id)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(400, { error: "Server ID already exists" }));
    await expect(addServer("existing", stdioConfig)).rejects.toThrow("HTTP 400");
  });

  it("throws on 422 (validation error)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(422, { error: "Validation error: command required" }));
    await expect(addServer("bad", stdioConfig)).rejects.toThrow("HTTP 422");
  });
});

describe("updateServer", () => {
  const httpConfig: McpServerConfig = { type: "http", url: "http://localhost:4000" };

  it("sends PUT /api/config/servers/:id with correct JSON body", async () => {
    const status: McpServerStatus = { id: "my-server", connected: true, requiresOAuth: false, type: "http" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "my-server", status }));

    await updateServer("my-server", { config: httpConfig });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers/my-server",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ config: httpConfig }),
      })
    );
  });

  it("sends newId when renaming", async () => {
    const status: McpServerStatus = { id: "new-name", connected: false, requiresOAuth: false, type: "http" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "new-name", status }));

    await updateServer("old-name", { newId: "new-name", config: httpConfig });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers/old-name",
      expect.objectContaining({
        body: JSON.stringify({ newId: "new-name", config: httpConfig }),
      })
    );
  });

  it("encodes special characters in id", async () => {
    const status: McpServerStatus = { id: "my server", connected: false, requiresOAuth: false, type: "stdio" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "my server", status }));

    await updateServer("my server", { config: { type: "stdio", command: "node" } });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers/my%20server",
      expect.anything()
    );
  });

  it("returns { id, status } on 200", async () => {
    const status: McpServerStatus = { id: "my-server", connected: true, requiresOAuth: false, type: "http" };
    mockFetch.mockResolvedValueOnce(makeResponse(200, { id: "my-server", status }));

    const result = await updateServer("my-server", { config: httpConfig });

    expect(result).toEqual({ id: "my-server", status });
  });

  it("throws on 404 (not found)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, { error: "Server not found" }));
    await expect(updateServer("unknown", { config: httpConfig })).rejects.toThrow("HTTP 404");
  });

  it("throws on 400 (id conflict)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(400, { error: "New server ID already exists" }));
    await expect(updateServer("srv", { newId: "existing", config: httpConfig })).rejects.toThrow("HTTP 400");
  });
});

describe("deleteServer", () => {
  it("sends DELETE /api/config/servers/:id", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(204, ""));

    await deleteServer("my-server");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers/my-server",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("encodes special characters in id", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(204, ""));

    await deleteServer("my server/x");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/servers/my%20server%2Fx",
      expect.anything()
    );
  });

  it("returns void on 204", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(204, ""));

    const result = await deleteServer("my-server");

    expect(result).toBeUndefined();
  });

  it("throws on 404 (not found)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, { error: "Server not found" }));
    await expect(deleteServer("unknown")).rejects.toThrow("HTTP 404");
  });
});
