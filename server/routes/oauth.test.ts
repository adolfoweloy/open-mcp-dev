import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { McpServerStatus } from "../../shared/types.js";
import {
  createOAuthRouter,
  pendingSessions,
  oauthTokens,
  getOAuthToken,
  type OAuthDeps,
} from "./oauth.js";

// ── Mock auth deps ────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<OAuthDeps> = {}): OAuthDeps & {
  callCounts: Record<string, number>;
} {
  const callCounts: Record<string, number> = {
    discoverOAuthProtectedResourceMetadata: 0,
    discoverOAuthMetadata: 0,
    registerClient: 0,
    startAuthorization: 0,
    exchangeAuthorization: 0,
  };

  return {
    discoverOAuthProtectedResourceMetadata: async () => {
      callCounts["discoverOAuthProtectedResourceMetadata"]++;
      return {
        resource: "https://mcp.example.com",
        authorization_servers: ["https://auth.example.com"],
      } as never;
    },
    discoverOAuthMetadata: async () => {
      callCounts["discoverOAuthMetadata"]++;
      return {
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        response_types_supported: ["code"],
      } as never;
    },
    registerClient: async () => {
      callCounts["registerClient"]++;
      return {
        client_id: "dynamic-client-id",
        client_secret: "dynamic-secret",
      } as never;
    },
    startAuthorization: async () => {
      callCounts["startAuthorization"]++;
      return {
        authorizationUrl: new URL(
          "https://auth.example.com/authorize?response_type=code"
        ),
        codeVerifier: "test-code-verifier",
      };
    },
    exchangeAuthorization: async () => {
      callCounts["exchangeAuthorization"]++;
      return {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      } as never;
    },
    ...overrides,
    callCounts,
  };
}

// ── Config / Manager helpers ──────────────────────────────────────────────────

function makeConfig(extraServers: Record<string, unknown> = {}): Config {
  return {
    llm: {},
    mcp_servers: {
      oauth_server: {
        type: "http",
        url: "https://mcp.example.com",
        oauth: true,
      },
      plain_server: {
        type: "http",
        url: "https://plain.example.com",
      },
      stdio_server: {
        type: "stdio",
        command: "echo",
      },
      ...extraServers,
    },
  } as Config;
}

function makeMcpManager() {
  const connected = new Set<string>();
  let connectCallCount = 0;
  let lastConnectArgs: unknown[] = [];

  return {
    connectToServer: async (id: string, ...rest: unknown[]) => {
      connected.add(id);
      connectCallCount++;
      lastConnectArgs = [id, ...rest];
    },
    disconnectServer: async (id: string) => {
      connected.delete(id);
    },
    isConnected: (id: string) => connected.has(id),
    requiresOAuth: () => false,
    getServerStatuses: (): McpServerStatus[] => [],
    getToolsForAiSdk: async () => ({}),
    get connectCallCount() {
      return connectCallCount;
    },
    get lastConnectArgs() {
      return lastConnectArgs;
    },
  } as unknown as MCPClientManager & {
    connectCallCount: number;
    lastConnectArgs: unknown[];
  };
}

// ── Route caller helpers ──────────────────────────────────────────────────────

interface MockOut {
  capturedStatus: number;
  capturedBody: unknown;
  capturedRedirect: string | undefined;
}

function makeRes(): [ServerResponse, MockOut] {
  const out: MockOut = {
    capturedStatus: 200,
    capturedBody: undefined,
    capturedRedirect: undefined,
  };
  const res = {
    status(code: number) {
      out.capturedStatus = code;
      return this;
    },
    json(data: unknown) {
      out.capturedBody = data;
      return this;
    },
    redirect(url: string) {
      out.capturedRedirect = url;
      return this;
    },
  } as unknown as ServerResponse;
  return [res, out];
}

function makeReq(query: Record<string, string> = {}) {
  return {
    method: "GET",
    query,
    protocol: "http",
    get: (key: string) => (key === "host" ? "localhost:3000" : undefined),
  } as unknown as IncomingMessage & {
    query: Record<string, string>;
    protocol: string;
    get: (key: string) => string | undefined;
  };
}

async function callRoute(
  router: ReturnType<typeof createOAuthRouter>,
  path: "/oauth/start" | "/oauth/callback",
  query: Record<string, string> = {}
) {
  const stack = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          methods: Record<string, boolean>;
          stack: Array<{ handle: Function }>;
        };
      }>;
    }
  ).stack;

  const layer = stack.find(
    (l) => l.route?.path === path && l.route.methods["get"]
  );
  assert.ok(layer?.route, `GET ${path} route should exist`);

  const req = makeReq(query);
  const [res, out] = makeRes();
  await layer.route.stack[0].handle(req, res, () => {});
  return out;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createOAuthRouter", () => {
  beforeEach(() => {
    pendingSessions.clear();
    oauthTokens.clear();
  });

  describe("GET /oauth/start", () => {
    it("returns 400 when server query param is missing", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/start", {});
      assert.equal(out.capturedStatus, 400);
    });

    it("returns 400 for unknown server", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/start", {
        server: "nonexistent",
      });
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error.includes("nonexistent")
      );
    });

    it("returns 400 for non-oauth http server", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/start", {
        server: "plain_server",
      });
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error.includes("OAuth")
      );
    });

    it("returns 400 for stdio server", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/start", {
        server: "stdio_server",
      });
      assert.equal(out.capturedStatus, 400);
    });

    it("redirects to authorization URL for valid oauth server", async () => {
      const deps = makeDeps();
      const router = createOAuthRouter(makeConfig(), makeMcpManager(), deps);
      const out = await callRoute(router, "/oauth/start", {
        server: "oauth_server",
      });

      assert.ok(out.capturedRedirect, "should redirect");
      assert.ok(
        out.capturedRedirect!.startsWith("https://auth.example.com/authorize"),
        "should redirect to auth URL"
      );
      assert.equal(deps.callCounts["startAuthorization"], 1);
    });

    it("stores pending session with codeVerifier after redirect", async () => {
      const deps = makeDeps();
      const router = createOAuthRouter(makeConfig(), makeMcpManager(), deps);
      await callRoute(router, "/oauth/start", { server: "oauth_server" });

      assert.equal(pendingSessions.size, 1);
      const session = [...pendingSessions.values()][0]!;
      assert.equal(session.serverId, "oauth_server");
      assert.equal(session.codeVerifier, "test-code-verifier");
    });

    it("calls registerClient when no client_id is pre-configured", async () => {
      const deps = makeDeps();
      const router = createOAuthRouter(makeConfig(), makeMcpManager(), deps);
      await callRoute(router, "/oauth/start", { server: "oauth_server" });

      assert.equal(deps.callCounts["registerClient"], 1);
    });

    it("skips registerClient when client_id is pre-configured", async () => {
      const config = makeConfig({
        preconfigured: {
          type: "http",
          url: "https://mcp.example.com",
          oauth: true,
          client_id: "my-client-id",
        },
      });
      const deps = makeDeps();
      const router = createOAuthRouter(config, makeMcpManager(), deps);
      await callRoute(router, "/oauth/start", { server: "preconfigured" });

      assert.equal(
        deps.callCounts["registerClient"],
        0,
        "should NOT call registerClient"
      );
      assert.equal(deps.callCounts["startAuthorization"], 1);
    });
  });

  describe("GET /oauth/callback", () => {
    it("returns 400 when state param is missing", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/callback", {
        code: "auth-code",
      });
      assert.equal(out.capturedStatus, 400);
    });

    it("returns 400 for invalid state", async () => {
      const router = createOAuthRouter(makeConfig(), makeMcpManager());
      const out = await callRoute(router, "/oauth/callback", {
        code: "auth-code",
        state: "invalid-state",
      });
      assert.equal(out.capturedStatus, 400);
    });

    it("exchanges code and redirects to / for valid state", async () => {
      const deps = makeDeps();
      const manager = makeMcpManager();
      const router = createOAuthRouter(makeConfig(), manager, deps);

      // Start OAuth to create a pending session
      await callRoute(router, "/oauth/start", { server: "oauth_server" });
      const state = [...pendingSessions.keys()][0]!;

      // Complete the callback
      const out = await callRoute(router, "/oauth/callback", {
        code: "auth-code-123",
        state,
      });

      assert.equal(out.capturedRedirect, "/", "should redirect to /");
      assert.equal(deps.callCounts["exchangeAuthorization"], 1);
    });

    it("stores access token retrievable via getOAuthToken", async () => {
      const deps = makeDeps();
      const manager = makeMcpManager();
      const router = createOAuthRouter(makeConfig(), manager, deps);

      await callRoute(router, "/oauth/start", { server: "oauth_server" });
      const state = [...pendingSessions.keys()][0]!;

      await callRoute(router, "/oauth/callback", { code: "auth-code", state });

      const token = getOAuthToken("oauth_server");
      assert.ok(token, "token should be stored");
      assert.equal(token!.access_token, "test-access-token");
    });

    it("removes pending session after successful callback", async () => {
      const deps = makeDeps();
      const router = createOAuthRouter(makeConfig(), makeMcpManager(), deps);

      await callRoute(router, "/oauth/start", { server: "oauth_server" });
      assert.equal(pendingSessions.size, 1);

      const state = [...pendingSessions.keys()][0]!;
      await callRoute(router, "/oauth/callback", { code: "auth-code", state });

      assert.equal(pendingSessions.size, 0);
    });

    it("connects MCP server after successful callback", async () => {
      const deps = makeDeps();
      const manager = makeMcpManager() as ReturnType<typeof makeMcpManager> & {
        connectCallCount: number;
        lastConnectArgs: unknown[];
      };
      const router = createOAuthRouter(makeConfig(), manager as unknown as MCPClientManager, deps);

      await callRoute(router, "/oauth/start", { server: "oauth_server" });
      const state = [...pendingSessions.keys()][0]!;

      await callRoute(router, "/oauth/callback", { code: "auth-code", state });

      assert.equal(manager.connectCallCount, 1);
      assert.equal(manager.lastConnectArgs[0], "oauth_server");
      assert.equal(
        manager.lastConnectArgs[2],
        "test-access-token",
        "access token should be passed to connectToServer"
      );
    });
  });
});
