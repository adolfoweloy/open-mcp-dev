import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Config } from "../config.js";
import type {
  MCPClientManager,
  OAuthTokenSet,
  PendingAuthState,
  OAuthClientConfig,
} from "../lib/mcp-manager.js";
import type { McpServerStatus } from "../../shared/types.js";
import { createOAuthRouter } from "./oauth.js";

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

// ── Route caller helpers ──────────────────────────────────────────────────────

interface MockOut {
  capturedStatus: number;
  capturedBody: unknown;
  capturedRedirect: string | undefined;
  capturedHtml: string | undefined;
}

function makeRes(): [ServerResponse, MockOut] {
  const out: MockOut = {
    capturedStatus: 200,
    capturedBody: undefined,
    capturedRedirect: undefined,
    capturedHtml: undefined,
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
    type(_contentType: string) {
      return this;
    },
    send(html: string) {
      out.capturedHtml = html;
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
  path: "/oauth/callback",
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
  describe("GET /oauth/callback", () => {
    // ── Callback manager helper ──────────────────────────────────────────────

    function makeMcpManagerForCallback(options: {
      pendingState?: PendingAuthState;
      clientConfig?: OAuthClientConfig;
    } = {}) {
      const pendingStates = new Map<string, PendingAuthState>();
      if (options.pendingState) {
        pendingStates.set("test-state", options.pendingState);
      }

      const failOAuthFlowCalls: Array<{ serverId: string; error: Error }> = [];
      const completeOAuthFlowCalls: Array<{
        serverId: string;
        tokenSet: OAuthTokenSet;
      }> = [];
      const deletedStates: string[] = [];

      return {
        getPendingState: (state: string) => pendingStates.get(state),
        deletePendingState: (state: string) => {
          deletedStates.push(state);
          pendingStates.delete(state);
        },
        getOAuthClientConfig: (_serverId: string) =>
          options.clientConfig ?? {
            clientId: "test-client-id",
            authorizationEndpoint: "https://auth.example.com/authorize",
            tokenEndpoint: "https://auth.example.com/token",
          },
        failOAuthFlow: async (serverId: string, error: Error) => {
          failOAuthFlowCalls.push({ serverId, error });
        },
        completeOAuthFlow: async (serverId: string, tokenSet: OAuthTokenSet) => {
          completeOAuthFlowCalls.push({ serverId, tokenSet });
        },
        get failOAuthFlowCalls() {
          return failOAuthFlowCalls;
        },
        get completeOAuthFlowCalls() {
          return completeOAuthFlowCalls;
        },
        get deletedStates() {
          return deletedStates;
        },
      } as unknown as MCPClientManager & {
        failOAuthFlowCalls: typeof failOAuthFlowCalls;
        completeOAuthFlowCalls: typeof completeOAuthFlowCalls;
        deletedStates: typeof deletedStates;
      };
    }

    // ── Fetch mock helpers ───────────────────────────────────────────────────

    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    function mockFetch(status: number, body: unknown) {
      global.fetch = async () =>
        ({
          ok: status >= 200 && status < 300,
          status,
          json: async () => body,
        }) as Response;
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    it("(a) missing state → 400", async () => {
      const mgr = makeMcpManagerForCallback();
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {});
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error.includes("state")
      );
    });

    it("(b) unknown state → 400", async () => {
      const mgr = makeMcpManagerForCallback(); // no pending state set
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {
        state: "unknown-state",
        code: "some-code",
      });
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error.includes("state")
      );
    });

    it("(c) expired state → 400 with 'expired' message", async () => {
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() - 1000, // expired
        },
      });
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "some-code",
      });
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error
          .toLowerCase()
          .includes("expir")
      );
    });

    it("(d) missing code → 400", async () => {
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      });
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {
        state: "test-state",
      });
      assert.equal(out.capturedStatus, 400);
      assert.ok(
        (out.capturedBody as { error: string }).error
          .toLowerCase()
          .includes("code")
      );
    });

    it("(e) successful exchange → HTML with postMessage and window.close()", async () => {
      mockFetch(200, {
        access_token: "acc-tok",
        refresh_token: "ref-tok",
        expires_in: 3600,
      });
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      });
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "auth-code",
      });
      assert.ok(out.capturedHtml, "should respond with HTML");
      assert.ok(
        out.capturedHtml!.includes("postMessage"),
        "HTML should contain postMessage"
      );
      assert.ok(
        out.capturedHtml!.includes("oauth_server"),
        "HTML should contain serverId"
      );
      assert.ok(
        out.capturedHtml!.includes("window.close()"),
        "HTML should close window"
      );
    });

    it("(f) token exchange failure → calls failOAuthFlow and returns 502", async () => {
      mockFetch(400, { error: "invalid_grant" });
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      }) as MCPClientManager & {
        failOAuthFlowCalls: Array<{ serverId: string; error: Error }>;
        completeOAuthFlowCalls: Array<{
          serverId: string;
          tokenSet: OAuthTokenSet;
        }>;
        deletedStates: string[];
      };
      const router = createOAuthRouter(makeConfig(), mgr);
      const out = await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "auth-code",
      });
      assert.equal(out.capturedStatus, 502);
      assert.equal(mgr.failOAuthFlowCalls.length, 1);
      assert.equal(mgr.failOAuthFlowCalls[0]!.serverId, "oauth_server");
    });

    it("(g) successful exchange → calls completeOAuthFlow with tokenSet", async () => {
      mockFetch(200, {
        access_token: "acc-tok",
        refresh_token: "ref-tok",
        expires_in: 3600,
      });
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      }) as MCPClientManager & {
        failOAuthFlowCalls: Array<{ serverId: string; error: Error }>;
        completeOAuthFlowCalls: Array<{
          serverId: string;
          tokenSet: OAuthTokenSet;
        }>;
        deletedStates: string[];
      };
      const router = createOAuthRouter(makeConfig(), mgr);
      await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "auth-code",
      });
      assert.equal(mgr.completeOAuthFlowCalls.length, 1);
      const call = mgr.completeOAuthFlowCalls[0]!;
      assert.equal(call.serverId, "oauth_server");
      assert.equal(call.tokenSet.accessToken, "acc-tok");
      assert.equal(call.tokenSet.refreshToken, "ref-tok");
      assert.ok(call.tokenSet.expiresAt! > Date.now());
    });

    it("(h) pendingState entry deleted on success", async () => {
      mockFetch(200, { access_token: "acc-tok" });
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      }) as MCPClientManager & {
        failOAuthFlowCalls: Array<{ serverId: string; error: Error }>;
        completeOAuthFlowCalls: Array<{
          serverId: string;
          tokenSet: OAuthTokenSet;
        }>;
        deletedStates: string[];
      };
      const router = createOAuthRouter(makeConfig(), mgr);
      await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "auth-code",
      });
      assert.ok(
        mgr.deletedStates.includes("test-state"),
        "pending state should be deleted on success"
      );
    });

    it("(h) pendingState entry deleted on failure", async () => {
      mockFetch(400, { error: "invalid_grant" });
      const mgr = makeMcpManagerForCallback({
        pendingState: {
          serverId: "oauth_server",
          codeVerifier: "verifier",
          expiresAt: Date.now() + 600_000,
        },
      }) as MCPClientManager & {
        failOAuthFlowCalls: Array<{ serverId: string; error: Error }>;
        completeOAuthFlowCalls: Array<{
          serverId: string;
          tokenSet: OAuthTokenSet;
        }>;
        deletedStates: string[];
      };
      const router = createOAuthRouter(makeConfig(), mgr);
      await callRoute(router, "/oauth/callback", {
        state: "test-state",
        code: "auth-code",
      });
      assert.ok(
        mgr.deletedStates.includes("test-state"),
        "pending state should be deleted on failure"
      );
    });
  });
});
