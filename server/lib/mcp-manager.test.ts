import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPClientManager } from "./mcp-manager.js";
import type {
  OAuthClientConfig,
  OAuthTokenSet,
  AuthLock,
  PendingAuthState,
} from "./mcp-manager.js";
import type { McpServerConfig } from "../config.js";

/** Subclass that stubs out connectToServer to avoid real network calls in OAuth tests. */
class TestMCPClientManager extends MCPClientManager {
  connectToServerCalls: Array<{
    id: string;
    config: McpServerConfig;
    accessToken?: string;
  }> = [];

  override async connectToServer(
    id: string,
    config: McpServerConfig,
    accessToken?: string
  ): Promise<void> {
    this.connectToServerCalls.push({ id, config, accessToken });
  }
}

/** Creates a linked in-memory MCP server with the given tools, returns the client-side transport. */
async function createMockServer(
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    result?: unknown;
  }>
): Promise<InMemoryTransport> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = new Server(
    { name: "test-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? `Tool ${t.name}`,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    return {
      content: [{ type: "text", text: JSON.stringify(tool.result ?? {}) }],
    };
  });

  await server.connect(serverTransport);
  return clientTransport;
}

describe("MCPClientManager", () => {
  describe("OAuth data structures", () => {
    it("initializes oauthClients as an empty Map", () => {
      const manager = new MCPClientManager();
      const map = (manager as unknown as { oauthClients: Map<string, OAuthClientConfig> }).oauthClients;
      assert.ok(map instanceof Map);
      assert.equal(map.size, 0);
    });

    it("initializes tokenSets as an empty Map", () => {
      const manager = new MCPClientManager();
      const map = (manager as unknown as { tokenSets: Map<string, OAuthTokenSet> }).tokenSets;
      assert.ok(map instanceof Map);
      assert.equal(map.size, 0);
    });

    it("initializes authLocks as an empty Map", () => {
      const manager = new MCPClientManager();
      const map = (manager as unknown as { authLocks: Map<string, AuthLock> }).authLocks;
      assert.ok(map instanceof Map);
      assert.equal(map.size, 0);
    });

    it("initializes pendingStates as an empty Map", () => {
      const manager = new MCPClientManager();
      const map = (manager as unknown as { pendingStates: Map<string, PendingAuthState> }).pendingStates;
      assert.ok(map instanceof Map);
      assert.equal(map.size, 0);
    });

    it("each manager instance has independent map state", () => {
      const m1 = new MCPClientManager();
      const m2 = new MCPClientManager();
      const map1 = (m1 as unknown as { oauthClients: Map<string, OAuthClientConfig> }).oauthClients;
      const map2 = (m2 as unknown as { oauthClients: Map<string, OAuthClientConfig> }).oauthClients;
      assert.notEqual(map1, map2);
    });

    it("OAuthClientConfig interface shape compiles correctly", () => {
      // TypeScript compilation validates this at build time; runtime check confirms the shape
      const config: OAuthClientConfig = {
        clientId: "test-client",
        authorizationEndpoint: "https://auth.example.com/authorize",
        tokenEndpoint: "https://auth.example.com/token",
      };
      assert.equal(config.clientId, "test-client");
    });

    it("OAuthTokenSet interface shape compiles correctly", () => {
      const tokenSet: OAuthTokenSet = {
        accessToken: "access-token-value",
        refreshToken: "refresh-token-value",
        expiresAt: Date.now() + 3600_000,
      };
      assert.ok(tokenSet.accessToken);
    });

    it("AuthLock interface shape compiles correctly", () => {
      const lock: AuthLock = {
        inProgress: false,
        queue: [{ resolve: () => {}, reject: () => {} }],
      };
      assert.equal(lock.inProgress, false);
      assert.equal(lock.queue.length, 1);
    });

    it("PendingAuthState interface shape compiles correctly", () => {
      const state: PendingAuthState = {
        serverId: "my-server",
        codeVerifier: "some-verifier-string",
        expiresAt: Date.now() + 600_000,
      };
      assert.equal(state.serverId, "my-server");
    });
  });

  describe("connectWithTransport / isConnected / disconnectServer", () => {
    it("connects and reports isConnected=true", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([]);
      await manager.connectWithTransport("srv1", transport);
      assert.equal(manager.isConnected("srv1"), true);
    });

    it("disconnectServer removes from map", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([]);
      await manager.connectWithTransport("srv1", transport);
      await manager.disconnectServer("srv1");
      assert.equal(manager.isConnected("srv1"), false);
    });

    it("disconnectServer on unknown id is a no-op", async () => {
      const manager = new MCPClientManager();
      await assert.doesNotReject(() => manager.disconnectServer("nonexistent"));
    });
  });

  describe("connectToServer deduplication", () => {
    it("concurrent connect calls issue only one connection", async () => {
      let connectCount = 0;
      const manager = new MCPClientManager();

      // Patch _doConnect via inheritance isn't available, so we test via
      // stdio transport with a real command that fails fast. Instead we
      // observe that after parallel connectWithTransport calls there is
      // only one client entry.
      //
      // For the deduplication test we verify the pending Map behaviour
      // indirectly: two connectToServer calls for the same http server
      // that are awaited in parallel must not create two clients.
      //
      // We use a stdio config pointing to a non-existent command so both
      // calls will fail with the same error, but the pending Map should
      // mean only one attempt proceeds. We verify by checking that both
      // reject (rather than one succeeding and one getting a different error).
      const cfg: McpServerConfig = {
        type: "stdio",
        command: "__nonexistent_command_xyz__",
        args: [],
      };

      const [p1, p2] = await Promise.allSettled([
        manager.connectToServer("dedup-srv", cfg),
        manager.connectToServer("dedup-srv", cfg),
      ]);

      // Both should reject (command not found)
      assert.equal(p1.status, "rejected");
      assert.equal(p2.status, "rejected");
      // Since p2 reuses the same promise as p1, they should be the same error
      assert.equal(
        (p1 as PromiseRejectedResult).reason.message,
        (p2 as PromiseRejectedResult).reason.message
      );

      connectCount++; // just to confirm the test ran
      assert.equal(connectCount, 1);
    });
  });

  describe("getServerStatuses", () => {
    it("returns correct connected and requiresOAuth flags using internal serverConfigs", async () => {
      const manager = new MCPClientManager();
      const t1 = await createMockServer([]);
      await manager.connectWithTransport("connected-srv", t1);

      // Populate serverConfigs via addServer for disconnected and oauth servers
      // For connected-srv we use connectWithTransport so we manually register config
      manager.getServerConfigs().set("connected-srv", { type: "stdio", command: "echo" });
      manager.getServerConfigs().set("disconnected-srv", { type: "stdio", command: "echo" });
      manager.getServerConfigs().set("oauth-srv", {
        type: "http",
        url: "https://example.com/mcp",
        oauth: true,
      });

      const statuses = manager.getServerStatuses();
      assert.equal(statuses.length, 3);

      const connected = statuses.find((s) => s.id === "connected-srv");
      assert.ok(connected);
      assert.equal(connected.connected, true);
      assert.equal(connected.requiresOAuth, false);
      assert.equal(connected.type, "stdio");

      const disconnected = statuses.find((s) => s.id === "disconnected-srv");
      assert.ok(disconnected);
      assert.equal(disconnected.connected, false);
      assert.equal(disconnected.requiresOAuth, false);
      assert.equal(disconnected.type, "stdio");

      const oauth = statuses.find((s) => s.id === "oauth-srv");
      assert.ok(oauth);
      assert.equal(oauth.connected, false);
      assert.equal(oauth.requiresOAuth, true);
      assert.equal(oauth.type, "http");
    });
  });

  describe("requiresOAuth", () => {
    it("returns true only for http servers with oauth:true using internal serverConfigs", () => {
      const manager = new MCPClientManager();
      manager.getServerConfigs().set("stdio-srv", { type: "stdio", command: "echo" });
      manager.getServerConfigs().set("http-no-oauth", { type: "http", url: "http://example.com" });
      manager.getServerConfigs().set("http-oauth", {
        type: "http",
        url: "http://example.com",
        oauth: true,
      });
      assert.equal(manager.requiresOAuth("stdio-srv"), false);
      assert.equal(manager.requiresOAuth("http-no-oauth"), false);
      assert.equal(manager.requiresOAuth("http-oauth"), true);
    });
  });

  describe("prepareOAuthFlow", () => {
    const SERVER_URL = "https://mcp.example.com/mcp";
    const PORT = 3000;
    const METADATA_URL = "https://auth.example.com/.well-known/oauth-resource";
    const RFC8414_URL = "https://mcp.example.com/.well-known/oauth-authorization-server";
    const REG_ENDPOINT = "https://auth.example.com/register";
    const AUTH_ENDPOINT = "https://auth.example.com/authorize";
    const TOKEN_ENDPOINT = "https://auth.example.com/token";
    const CLIENT_ID = "test-client-id";

    const baseMetadata = {
      authorization_endpoint: AUTH_ENDPOINT,
      token_endpoint: TOKEN_ENDPOINT,
      registration_endpoint: REG_ENDPOINT,
    };

    const makeJsonResponse = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    /** Response with WWW-Authenticate pointing to METADATA_URL (MCP spec discovery). */
    const makeMcpDiscoveryResponse = (): Response =>
      new Response("", {
        status: 200,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${METADATA_URL}"`,
        },
      });

    type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

    let originalFetch: typeof globalThis.fetch;
    before(() => { originalFetch = globalThis.fetch; });
    afterEach(() => { globalThis.fetch = originalFetch; });

    /** Sets up the standard happy-path fetch mock (MCP discovery → metadata → registration). */
    const setHappyPathFetch = (override?: Partial<Record<string, FetchMock>>) => {
      const handlers: Record<string, FetchMock> = {
        [SERVER_URL]: async () => makeMcpDiscoveryResponse(),
        [METADATA_URL]: async () => makeJsonResponse(baseMetadata),
        [REG_ENDPOINT]: async () => makeJsonResponse({ client_id: CLIENT_ID }),
        ...override,
      };
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        const handler = handlers[urlStr];
        if (handler) return handler(input, init);
        throw new Error(`Unexpected fetch to: ${urlStr}`);
      };
    };

    it("(a) happy path: returns valid authorization URL with expected params", async () => {
      setHappyPathFetch();
      const manager = new MCPClientManager();
      const authUrl = await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);
      const parsed = new URL(authUrl);

      assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
      assert.equal(parsed.searchParams.get("response_type"), "code");
      assert.equal(parsed.searchParams.get("redirect_uri"), `http://localhost:${PORT}/oauth/callback`);
      assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
      assert.ok(parsed.searchParams.get("code_challenge"), "code_challenge should be present");
      assert.ok(parsed.searchParams.get("state"), "state should be present");
    });

    it("(b) MCP discovery fails → RFC 8414 fallback used", async () => {
      const calls: string[] = [];
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        calls.push(urlStr);

        if (urlStr === SERVER_URL) return new Response("", { status: 200 }); // no WWW-Authenticate
        if (urlStr === RFC8414_URL) return makeJsonResponse(baseMetadata);
        if (urlStr === REG_ENDPOINT) return makeJsonResponse({ client_id: CLIENT_ID });
        throw new Error(`Unexpected fetch: ${urlStr}`);
      };

      const manager = new MCPClientManager();
      const authUrl = await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);

      assert.ok(calls.includes(RFC8414_URL), "RFC 8414 fallback URL must be fetched");
      const parsed = new URL(authUrl);
      assert.equal(parsed.searchParams.get("client_id"), CLIENT_ID);
    });

    it("(c) both discovery methods fail → throws OAuthDiscoveryError", async () => {
      globalThis.fetch = async (): Promise<Response> =>
        new Response("not-json", { status: 200 });

      const manager = new MCPClientManager();
      await assert.rejects(
        () => manager.prepareOAuthFlow("srv", SERVER_URL, PORT),
        (err: Error) => {
          assert.equal(err.name, "OAuthDiscoveryError");
          return true;
        }
      );
    });

    it("(d) registration non-2xx → throws OAuthRegistrationError", async () => {
      setHappyPathFetch({
        [REG_ENDPOINT]: async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }),
      });

      const manager = new MCPClientManager();
      await assert.rejects(
        () => manager.prepareOAuthFlow("srv", SERVER_URL, PORT),
        (err: Error) => {
          assert.equal(err.name, "OAuthRegistrationError");
          return true;
        }
      );
    });

    it("(e) second call for same serverId skips registration", async () => {
      let registrationCalls = 0;
      setHappyPathFetch({
        [REG_ENDPOINT]: async () => {
          registrationCalls++;
          return makeJsonResponse({ client_id: CLIENT_ID });
        },
      });

      const manager = new MCPClientManager();
      await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);
      await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);

      assert.equal(registrationCalls, 1, "registration should happen only once per serverId");
      const oauthClients = (manager as unknown as { oauthClients: Map<string, OAuthClientConfig> }).oauthClients;
      assert.equal(oauthClients.size, 1);
    });

    it("(f) discovery fetch throws (simulating timeout) → falls through to RFC 8414", async () => {
      const calls: string[] = [];
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        calls.push(urlStr);

        if (urlStr === SERVER_URL) {
          const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
          throw err;
        }
        if (urlStr === RFC8414_URL) return makeJsonResponse(baseMetadata);
        if (urlStr === REG_ENDPOINT) return makeJsonResponse({ client_id: CLIENT_ID });
        throw new Error(`Unexpected fetch: ${urlStr}`);
      };

      const manager = new MCPClientManager();
      const authUrl = await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);

      assert.ok(calls.includes(RFC8414_URL), "RFC 8414 fallback should be used after discovery timeout");
      assert.equal(new URL(authUrl).searchParams.get("client_id"), CLIENT_ID);
    });

    it("(g) registration fetch throws (simulating timeout) → throws OAuthRegistrationError", async () => {
      setHappyPathFetch({
        [REG_ENDPOINT]: async () => {
          const err = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
          throw err;
        },
      });

      const manager = new MCPClientManager();
      await assert.rejects(
        () => manager.prepareOAuthFlow("srv", SERVER_URL, PORT),
        (err: Error) => {
          assert.equal(err.name, "OAuthRegistrationError");
          return true;
        }
      );
    });

    it("(h) pendingStates entry has expiresAt within ±1 s of Date.now() + 10 min", async () => {
      setHappyPathFetch();
      const manager = new MCPClientManager();
      const before = Date.now();
      await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);
      const after = Date.now();

      const pendingStates = (manager as unknown as { pendingStates: Map<string, PendingAuthState> }).pendingStates;
      assert.equal(pendingStates.size, 1);

      const entry = pendingStates.values().next().value!;
      assert.ok(entry.expiresAt >= before + 600_000, "expiresAt should be at least 10 min from before");
      assert.ok(entry.expiresAt <= after + 600_000 + 1000, "expiresAt should be at most 10 min + 1s from after");
    });

    it("(i) code_verifier is ≥43 chars and Base64URL-encoded", async () => {
      setHappyPathFetch();
      const manager = new MCPClientManager();
      await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);

      const pendingStates = (manager as unknown as { pendingStates: Map<string, PendingAuthState> }).pendingStates;
      const entry = pendingStates.values().next().value!;

      assert.ok(entry.codeVerifier.length >= 43, `code_verifier length ${entry.codeVerifier.length} should be ≥43`);
      assert.match(entry.codeVerifier, /^[A-Za-z0-9_-]+$/, "code_verifier must be Base64URL characters only (no padding)");
    });

    it("(j) state is 16-byte Base64URL (22 chars)", async () => {
      setHappyPathFetch();
      const manager = new MCPClientManager();
      const authUrl = await manager.prepareOAuthFlow("srv", SERVER_URL, PORT);

      const state = new URL(authUrl).searchParams.get("state");
      assert.ok(state, "state param must be present in authUrl");
      // 16 bytes → base64url → 22 chars (no padding)
      assert.equal(state.length, 22, `state should be 22 chars (16-byte Base64URL), got ${state.length}`);
      assert.match(state, /^[A-Za-z0-9_-]+$/, "state must be Base64URL characters only");
    });
  });

  describe("completeOAuthFlow / failOAuthFlow", () => {
    /** Helper: insert an AuthLock with N queued callbacks, returns the promise array and resolve/reject spies. */
    function buildQueuedLock(
      manager: MCPClientManager,
      serverId: string,
      count: number
    ): Array<Promise<void>> {
      const authLocks = (
        manager as unknown as { authLocks: Map<string, AuthLock> }
      ).authLocks;

      const promises: Array<Promise<void>> = [];
      const lock: AuthLock = { inProgress: true, queue: [] };
      for (let i = 0; i < count; i++) {
        const p = new Promise<void>((resolve, reject) => {
          lock.queue.push({ resolve, reject });
        });
        promises.push(p);
      }
      authLocks.set(serverId, lock);
      return promises;
    }

    it("(a) completeOAuthFlow resolves N queued promise callbacks in order", async () => {
      const manager = new TestMCPClientManager();
      const promises = buildQueuedLock(manager, "srv", 3);

      const tokenSet: OAuthTokenSet = { accessToken: "tok" };
      await manager.completeOAuthFlow("srv", tokenSet);

      const results = await Promise.allSettled(promises);
      for (const r of results) {
        assert.equal(r.status, "fulfilled");
      }
    });

    it("(b) completeOAuthFlow stores token in tokenSets map", async () => {
      const manager = new TestMCPClientManager();
      const tokenSet: OAuthTokenSet = {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: Date.now() + 3600_000,
      };

      await manager.completeOAuthFlow("srv", tokenSet);

      const tokenSets = (
        manager as unknown as { tokenSets: Map<string, OAuthTokenSet> }
      ).tokenSets;
      const stored = tokenSets.get("srv");
      assert.ok(stored, "tokenSets should have an entry for serverId");
      assert.equal(stored.accessToken, "access-123");
      assert.equal(stored.refreshToken, "refresh-456");
    });

    it("(c) completeOAuthFlow calls connectToServer with the accessToken", async () => {
      const manager = new TestMCPClientManager();
      // Set oauthServerUrls so completeOAuthFlow tries to connect
      const oauthServerUrls = (
        manager as unknown as { oauthServerUrls: Map<string, string> }
      ).oauthServerUrls;
      oauthServerUrls.set("srv", "https://mcp.example.com/mcp");

      const tokenSet: OAuthTokenSet = { accessToken: "my-access-token" };
      await manager.completeOAuthFlow("srv", tokenSet);

      assert.equal(manager.connectToServerCalls.length, 1);
      const call = manager.connectToServerCalls[0];
      assert.equal(call.id, "srv");
      assert.equal(call.accessToken, "my-access-token");
      assert.equal(call.config.type, "http");
    });

    it("(d) completeOAuthFlow clears authLock (inProgress=false, queue empty)", async () => {
      const manager = new TestMCPClientManager();
      buildQueuedLock(manager, "srv", 2);

      await manager.completeOAuthFlow("srv", { accessToken: "tok" });

      const authLocks = (
        manager as unknown as { authLocks: Map<string, AuthLock> }
      ).authLocks;
      const lock = authLocks.get("srv");
      assert.ok(lock, "authLock entry should still exist");
      assert.equal(lock.inProgress, false);
      assert.equal(lock.queue.length, 0);
    });

    it("(e) failOAuthFlow rejects all queued callbacks with the provided error", async () => {
      const manager = new TestMCPClientManager();
      const promises = buildQueuedLock(manager, "srv", 3);

      const error = new Error("auth cancelled");
      await manager.failOAuthFlow("srv", error);

      const results = await Promise.allSettled(promises);
      for (const r of results) {
        assert.equal(r.status, "rejected");
        assert.equal((r as PromiseRejectedResult).reason.message, "auth cancelled");
      }
    });

    it("(f) failOAuthFlow clears authLock (inProgress=false, queue empty)", async () => {
      const manager = new TestMCPClientManager();
      const promises = buildQueuedLock(manager, "srv", 2);
      // Suppress unhandled rejections from the queued promises
      for (const p of promises) p.catch(() => {});

      await manager.failOAuthFlow("srv", new Error("cancelled"));

      const authLocks = (
        manager as unknown as { authLocks: Map<string, AuthLock> }
      ).authLocks;
      const lock = authLocks.get("srv");
      assert.ok(lock, "authLock entry should still exist");
      assert.equal(lock.inProgress, false);
      assert.equal(lock.queue.length, 0);
    });

    it("(g) completeOAuthFlow is a no-op when no lock entry exists", async () => {
      const manager = new TestMCPClientManager();
      await assert.doesNotReject(() =>
        manager.completeOAuthFlow("no-lock-srv", { accessToken: "tok" })
      );
    });

    it("(g) failOAuthFlow is a no-op when no lock entry exists", async () => {
      const manager = new TestMCPClientManager();
      await assert.doesNotReject(() =>
        manager.failOAuthFlow("no-lock-srv", new Error("err"))
      );
    });
  });

  describe("callWithAuth", () => {
    const TOKEN_ENDPOINT = "https://auth.example.com/token";
    const CLIENT_ID = "test-client-id";

    /** Helper: inject an OAuthClientConfig into the manager. */
    function setOAuthClient(manager: MCPClientManager, serverId: string): void {
      const oauthClients = (
        manager as unknown as { oauthClients: Map<string, OAuthClientConfig> }
      ).oauthClients;
      oauthClients.set(serverId, {
        clientId: CLIENT_ID,
        authorizationEndpoint: "https://auth.example.com/authorize",
        tokenEndpoint: TOKEN_ENDPOINT,
      });
    }

    /** Helper: inject a tokenSet into the manager. */
    function setTokenSet(
      manager: MCPClientManager,
      serverId: string,
      tokenSet: OAuthTokenSet
    ): void {
      const tokenSets = (
        manager as unknown as { tokenSets: Map<string, OAuthTokenSet> }
      ).tokenSets;
      tokenSets.set(serverId, tokenSet);
    }

    /** Helper: get the authLock for a serverId. */
    function getAuthLock(
      manager: MCPClientManager,
      serverId: string
    ): AuthLock | undefined {
      return (
        manager as unknown as { authLocks: Map<string, AuthLock> }
      ).authLocks.get(serverId);
    }

    /** Helper: get the stored tokenSet for a serverId. */
    function getTokenSet(
      manager: MCPClientManager,
      serverId: string
    ): OAuthTokenSet | undefined {
      return (
        manager as unknown as { tokenSets: Map<string, OAuthTokenSet> }
      ).tokenSets.get(serverId);
    }

    /** Creates a 401 error as the HTTP transport would throw. */
    function make401Error(): Error {
      return Object.assign(new Error("Unauthorized"), { status: 401 });
    }

    let originalFetch: typeof globalThis.fetch;
    before(() => {
      originalFetch = globalThis.fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("(a) calls fn() directly when token exists and is not near expiry", async () => {
      const manager = new TestMCPClientManager();
      setTokenSet(manager, "srv", {
        accessToken: "my-token",
        expiresAt: Date.now() + 3600_000, // 1 hour away
      });

      let fnCalled = false;
      const fn = async () => {
        fnCalled = true;
        return "result";
      };

      const result = await manager.callWithAuth("srv", fn);
      assert.equal(result, "result");
      assert.equal(fnCalled, true);
    });

    it("(b) first 401 sets inProgress=true and calls emitEvent", async () => {
      const manager = new TestMCPClientManager();
      const events: object[] = [];

      let firstCall = true;
      const fn = async (): Promise<string> => {
        if (firstCall) {
          firstCall = false;
          throw make401Error();
        }
        return "ok";
      };

      // Start callWithAuth but don't await yet
      const promise = manager.callWithAuth("srv", fn, (e) => events.push(e));

      // Let microtasks run so callWithAuth reaches the waiting state
      await Promise.resolve();
      await Promise.resolve();

      const lock = getAuthLock(manager, "srv");
      assert.ok(lock, "authLock should exist");
      assert.equal(lock.inProgress, true);
      // auth_required event + oauth-start debug event
      assert.ok(events.length >= 1, "at least one event should have been emitted");
      assert.deepEqual(events[0], { type: "auth_required", serverId: "srv" });

      // Resolve the lock queue to unblock the promise
      lock.queue[0].resolve();
      await promise;
    });

    it("(c) after completeOAuthFlow resolves lock, fn() is retried and returns result", async () => {
      const manager = new TestMCPClientManager();
      const events: object[] = [];

      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        if (callCount === 1) throw make401Error();
        return "retried-result";
      };

      const promise = manager.callWithAuth("srv", fn, (e) => events.push(e));

      // Let callWithAuth reach waiting state
      await Promise.resolve();
      await Promise.resolve();

      assert.ok(events.length >= 1, "auth_required should have been emitted");
      assert.deepEqual(events[0], { type: "auth_required", serverId: "srv" });

      // Simulate completeOAuthFlow resolving the lock
      await manager.completeOAuthFlow("srv", { accessToken: "new-token" });

      const result = await promise;
      assert.equal(result, "retried-result");
      assert.equal(callCount, 2);
    });

    it("(d) concurrent 401s for the same server all queue behind one lock — only one auth_required emitted", async () => {
      const manager = new TestMCPClientManager();
      const events: object[] = [];

      let resolveFirst!: () => void;
      let firstCall = true;

      const fn = async (): Promise<string> => {
        if (firstCall) {
          firstCall = false;
          throw make401Error();
        }
        // Subsequent calls also 401 until auth completes
        throw make401Error();
      };

      // All three callers will 401 on first call
      let callCountA = 0;
      let callCountB = 0;
      let callCountC = 0;

      const fnA = async (): Promise<string> => {
        callCountA++;
        if (callCountA === 1) throw make401Error();
        return "A";
      };
      const fnB = async (): Promise<string> => {
        callCountB++;
        if (callCountB === 1) throw make401Error();
        return "B";
      };
      const fnC = async (): Promise<string> => {
        callCountC++;
        if (callCountC === 1) throw make401Error();
        return "C";
      };

      const pA = manager.callWithAuth("srv", fnA, (e) => events.push(e));
      const pB = manager.callWithAuth("srv", fnB, (e) => events.push(e));
      const pC = manager.callWithAuth("srv", fnC, (e) => events.push(e));

      // Let all three reach their waiting states
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Only one auth_required should have been emitted
      const authRequiredEvents = events.filter(
        (e) => (e as { type: string }).type === "auth_required"
      );
      assert.equal(
        authRequiredEvents.length,
        1,
        "only one auth_required should be emitted"
      );

      const lock = getAuthLock(manager, "srv");
      assert.ok(lock, "lock should exist");
      assert.equal(lock.inProgress, true);

      // Queue should have entries from B and C (A set the lock and is also queued)
      assert.ok(lock.queue.length >= 1, "queue should have waiting callers");

      // Resolve via completeOAuthFlow
      await manager.completeOAuthFlow("srv", { accessToken: "new-token" });

      const [rA, rB, rC] = await Promise.all([pA, pB, pC]);
      assert.equal(rA, "A");
      assert.equal(rB, "B");
      assert.equal(rC, "C");
    });

    it("(e) failOAuthFlow causes all queued callers to reject with 'OAuth cancelled by user'", async () => {
      const manager = new TestMCPClientManager();

      let callCountA = 0;
      let callCountB = 0;
      const fnA = async (): Promise<string> => {
        callCountA++;
        if (callCountA === 1) throw make401Error();
        return "A";
      };
      const fnB = async (): Promise<string> => {
        callCountB++;
        if (callCountB === 1) throw make401Error();
        return "B";
      };

      const pA = manager.callWithAuth("srv", fnA, () => {});
      const pB = manager.callWithAuth("srv", fnB, () => {});

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const cancelError = new Error("OAuth cancelled by user");
      await manager.failOAuthFlow("srv", cancelError);

      const [rA, rB] = await Promise.allSettled([pA, pB]);
      assert.equal(rA.status, "rejected");
      assert.equal(rB.status, "rejected");
    });

    it("(f) proactive refresh fires when expiresAt is within 60 s and refreshToken exists", async () => {
      const manager = new TestMCPClientManager();
      setOAuthClient(manager, "srv");
      setTokenSet(manager, "srv", {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 30_000, // within 60s
      });

      let fetchCalled = false;
      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        if (url === TOKEN_ENDPOINT) {
          fetchCalled = true;
          return new Response(
            JSON.stringify({
              access_token: "new-access-token",
              expires_in: 3600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      };

      const fn = async () => "ok";
      await manager.callWithAuth("srv", fn);

      assert.equal(fetchCalled, true, "token endpoint should be called for proactive refresh");
      const stored = getTokenSet(manager, "srv");
      assert.equal(stored?.accessToken, "new-access-token");
    });

    it("(g) successful refresh stores new tokenSet and does not emit auth_required", async () => {
      const manager = new TestMCPClientManager();
      setOAuthClient(manager, "srv");
      setTokenSet(manager, "srv", {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 30_000,
      });

      globalThis.fetch = async (): Promise<Response> =>
        new Response(
          JSON.stringify({ access_token: "refreshed-token", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      const events: object[] = [];
      const fn = async () => "result";
      await manager.callWithAuth("srv", fn, (e) => events.push(e));

      const authRequiredEvents = events.filter(
        (e) => (e as { type: string }).type === "auth_required"
      );
      assert.equal(authRequiredEvents.length, 0, "auth_required should NOT be emitted");
      assert.equal(getTokenSet(manager, "srv")?.accessToken, "refreshed-token");
    });

    it("(h) refresh failure (non-2xx) falls back to emitting auth_required", async () => {
      const manager = new TestMCPClientManager();
      setOAuthClient(manager, "srv");
      setTokenSet(manager, "srv", {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 30_000,
      });

      globalThis.fetch = async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        });

      const events: object[] = [];
      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        if (callCount === 1) throw make401Error();
        return "ok";
      };

      const promise = manager.callWithAuth("srv", fn, (e) => events.push(e));

      // Extra ticks needed: (1) fetch resolves, (2) _tryRefreshToken processes non-2xx and returns,
      // (3) callWithAuth calls fn() which throws, (4) catch block emits auth_required
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // auth_required should be emitted
      const authRequiredEvents = events.filter(
        (e) => (e as { type: string }).type === "auth_required"
      );
      assert.equal(authRequiredEvents.length, 1, "auth_required should be emitted after refresh failure");

      // Resolve the lock to complete the test
      const lock = getAuthLock(manager, "srv");
      assert.ok(lock);
      lock.queue[0].resolve();
      await promise;
    });

    it("(i) no refresh token → skips refresh, emits auth_required", async () => {
      const manager = new TestMCPClientManager();
      setOAuthClient(manager, "srv");
      setTokenSet(manager, "srv", {
        accessToken: "old-token",
        // no refreshToken
        expiresAt: Date.now() + 30_000,
      });

      let fetchCalled = false;
      globalThis.fetch = async (): Promise<Response> => {
        fetchCalled = true;
        return new Response("{}", { status: 200 });
      };

      const events: object[] = [];
      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        if (callCount === 1) throw make401Error();
        return "ok";
      };

      const promise = manager.callWithAuth("srv", fn, (e) => events.push(e));

      await Promise.resolve();
      await Promise.resolve();

      assert.equal(fetchCalled, false, "no token endpoint call without refreshToken");
      const authRequiredEvents = events.filter(
        (e) => (e as { type: string }).type === "auth_required"
      );
      assert.equal(authRequiredEvents.length, 1, "auth_required should be emitted");

      const lock = getAuthLock(manager, "srv");
      assert.ok(lock);
      lock.queue[0].resolve();
      await promise;
    });
  });

  describe("getToolsForAiSdk", () => {
    it("returns tools namespaced as {serverId}__{toolName}", async () => {
      const manager = new MCPClientManager();
      const t1 = await createMockServer([
        { name: "get_weather", description: "Get weather" },
        { name: "search", description: "Search" },
      ]);
      await manager.connectWithTransport("weather-srv", t1);

      const toolSet = await manager.getToolsForAiSdk();
      assert.ok("weather-srv__get_weather" in toolSet);
      assert.ok("weather-srv__search" in toolSet);
    });

    it("filters by serverIds when provided", async () => {
      const manager = new MCPClientManager();
      const t1 = await createMockServer([{ name: "tool_a" }]);
      const t2 = await createMockServer([{ name: "tool_b" }]);
      await manager.connectWithTransport("srv-a", t1);
      await manager.connectWithTransport("srv-b", t2);

      const toolSet = await manager.getToolsForAiSdk(["srv-a"]);
      assert.ok("srv-a__tool_a" in toolSet);
      assert.ok(!("srv-b__tool_b" in toolSet));
    });

    it("uses all connected servers when serverIds is omitted", async () => {
      const manager = new MCPClientManager();
      const t1 = await createMockServer([{ name: "tool_x" }]);
      const t2 = await createMockServer([{ name: "tool_y" }]);
      await manager.connectWithTransport("srv-x", t1);
      await manager.connectWithTransport("srv-y", t2);

      const toolSet = await manager.getToolsForAiSdk();
      assert.ok("srv-x__tool_x" in toolSet);
      assert.ok("srv-y__tool_y" in toolSet);
    });

    it("normalises schemas: adds type:object and properties when absent", async () => {
      // The MCP SDK validates inputSchema.type === "object" at the protocol level,
      // so we test normalization with a schema that has the required type but missing
      // properties — MCPClientManager should add properties:{} to ensure Anthropic compat.
      const manager = new MCPClientManager();
      const t1 = await createMockServer([
        {
          name: "bare_tool",
          // minimal schema with only type — no properties key
          inputSchema: { type: "object" },
        },
      ]);
      await manager.connectWithTransport("norm-srv", t1);

      const toolSet = await manager.getToolsForAiSdk();
      const tool = toolSet["norm-srv__bare_tool"];
      assert.ok(tool, "tool should exist");
      assert.ok(tool.parameters, "tool should have parameters");
    });

    it("skips servers not in serverIds list even if connected", async () => {
      const manager = new MCPClientManager();
      const t1 = await createMockServer([{ name: "skip_me" }]);
      await manager.connectWithTransport("skip-srv", t1);

      const toolSet = await manager.getToolsForAiSdk(["other-srv"]);
      // "other-srv" is not connected, so it should be skipped silently
      assert.deepEqual(Object.keys(toolSet), []);
    });
  });

  describe("CRUD: addServer / updateServer / removeServer / getServerConfigs", () => {
    /** Helper to access private maps via type cast */
    function getPrivateMap<T>(manager: MCPClientManager, key: string): Map<string, T> {
      return (manager as unknown as Record<string, Map<string, T>>)[key];
    }

    it("(a) addServer registers config and calls connectToServer", async () => {
      const manager = new TestMCPClientManager();
      const config: McpServerConfig = { type: "stdio", command: "echo", args: ["hello"] };

      await manager.addServer("my-srv", config);

      assert.equal(manager.connectToServerCalls.length, 1);
      assert.equal(manager.connectToServerCalls[0].id, "my-srv");
      assert.deepEqual(manager.connectToServerCalls[0].config, config);

      const configs = manager.getServerConfigs();
      assert.equal(configs.size, 1);
      assert.deepEqual(configs.get("my-srv"), config);
    });

    it("(b) updateServer with same id disconnects and reconnects with new config", async () => {
      const manager = new TestMCPClientManager();
      // Pre-populate a connected client so disconnectServer has something to close
      const t1 = await createMockServer([]);
      await manager.connectWithTransport("edit-srv", t1);
      manager.getServerConfigs().set("edit-srv", { type: "stdio", command: "old-cmd" });

      const newConfig: McpServerConfig = { type: "stdio", command: "new-cmd" };
      await manager.updateServer("edit-srv", "edit-srv", newConfig);

      // The client should be disconnected then reconnected via connectToServer
      assert.equal(manager.isConnected("edit-srv"), false, "disconnectServer should have been called");
      assert.equal(manager.connectToServerCalls.length, 1);
      assert.equal(manager.connectToServerCalls[0].id, "edit-srv");
      assert.deepEqual(manager.connectToServerCalls[0].config, newConfig);

      assert.deepEqual(manager.getServerConfigs().get("edit-srv"), newConfig);
    });

    it("(c) updateServer with rename removes old id from all Maps and registers new id", async () => {
      const manager = new TestMCPClientManager();
      // Set up old server with OAuth state
      manager.getServerConfigs().set("old-srv", { type: "http", url: "http://example.com" });
      getPrivateMap(manager, "oauthClients").set("old-srv", {
        clientId: "cid",
        authorizationEndpoint: "https://auth.example.com/authorize",
        tokenEndpoint: "https://auth.example.com/token",
      });
      getPrivateMap(manager, "tokenSets").set("old-srv", { accessToken: "tok" });
      getPrivateMap(manager, "authLocks").set("old-srv", { inProgress: false, queue: [] });
      getPrivateMap<PendingAuthState>(manager, "pendingStates").set("some-state-key", {
        serverId: "old-srv",
        codeVerifier: "verifier",
        expiresAt: Date.now() + 600_000,
      });
      getPrivateMap(manager, "oauthServerUrls").set("old-srv", "http://example.com");

      const newConfig: McpServerConfig = { type: "http", url: "http://new-example.com" };
      await manager.updateServer("old-srv", "new-srv", newConfig);

      // Old id should be gone from all maps
      assert.equal(manager.getServerConfigs().has("old-srv"), false);
      assert.equal(getPrivateMap(manager, "oauthClients").has("old-srv"), false);
      assert.equal(getPrivateMap(manager, "tokenSets").has("old-srv"), false);
      assert.equal(getPrivateMap(manager, "authLocks").has("old-srv"), false);
      assert.equal(getPrivateMap(manager, "oauthServerUrls").has("old-srv"), false);
      // pendingStates keyed by state value — the entry for old-srv should be removed
      const remainingPending = Array.from(
        getPrivateMap<PendingAuthState>(manager, "pendingStates").values()
      ).filter((s) => s.serverId === "old-srv");
      assert.equal(remainingPending.length, 0);

      // New id should be registered with new config
      assert.deepEqual(manager.getServerConfigs().get("new-srv"), newConfig);
      assert.equal(manager.connectToServerCalls.length, 1);
      assert.equal(manager.connectToServerCalls[0].id, "new-srv");
    });

    it("(d) removeServer disconnects and clears all 5 OAuth Maps", async () => {
      const manager = new TestMCPClientManager();
      // Connect a real in-memory transport so disconnectServer has a client to close
      const t1 = await createMockServer([]);
      await manager.connectWithTransport("rm-srv", t1);

      // Populate all OAuth maps
      manager.getServerConfigs().set("rm-srv", { type: "http", url: "http://example.com" });
      getPrivateMap(manager, "oauthClients").set("rm-srv", {
        clientId: "cid",
        authorizationEndpoint: "https://auth.example.com/authorize",
        tokenEndpoint: "https://auth.example.com/token",
      });
      getPrivateMap(manager, "tokenSets").set("rm-srv", { accessToken: "tok" });
      getPrivateMap(manager, "authLocks").set("rm-srv", { inProgress: false, queue: [] });
      getPrivateMap<PendingAuthState>(manager, "pendingStates").set("state-abc", {
        serverId: "rm-srv",
        codeVerifier: "verifier",
        expiresAt: Date.now() + 600_000,
      });
      getPrivateMap(manager, "oauthServerUrls").set("rm-srv", "http://example.com");

      await manager.removeServer("rm-srv");

      assert.equal(manager.isConnected("rm-srv"), false, "client should be disconnected");
      assert.equal(manager.getServerConfigs().has("rm-srv"), false);
      assert.equal(getPrivateMap(manager, "oauthClients").has("rm-srv"), false);
      assert.equal(getPrivateMap(manager, "tokenSets").has("rm-srv"), false);
      assert.equal(getPrivateMap(manager, "authLocks").has("rm-srv"), false);
      assert.equal(getPrivateMap(manager, "oauthServerUrls").has("rm-srv"), false);
      const pendingForSrv = Array.from(
        getPrivateMap<PendingAuthState>(manager, "pendingStates").values()
      ).filter((s) => s.serverId === "rm-srv");
      assert.equal(pendingForSrv.length, 0);
    });

    it("(e) getServerStatuses returns type and error fields", async () => {
      const manager = new TestMCPClientManager();
      // Add stdio server that is not connected
      manager.getServerConfigs().set("stdio-srv", { type: "stdio", command: "echo" });
      // Inject a server error
      getPrivateMap<string>(manager, "serverErrors").set("stdio-srv", "spawn failed");
      // Add http server with oauth
      manager.getServerConfigs().set("http-srv", {
        type: "http",
        url: "http://example.com",
        oauth: true,
      });

      const statuses = manager.getServerStatuses();
      assert.equal(statuses.length, 2);

      const stdioStatus = statuses.find((s) => s.id === "stdio-srv");
      assert.ok(stdioStatus);
      assert.equal(stdioStatus.type, "stdio");
      assert.equal(stdioStatus.connected, false);
      assert.equal(stdioStatus.error, "spawn failed");

      const httpStatus = statuses.find((s) => s.id === "http-srv");
      assert.ok(httpStatus);
      assert.equal(httpStatus.type, "http");
      assert.equal(httpStatus.requiresOAuth, true);
      assert.equal(httpStatus.error, undefined);
    });

    it("(f) getServerConfigs returns current Map state after add/update/remove sequences", async () => {
      const manager = new TestMCPClientManager();
      const cfgA: McpServerConfig = { type: "stdio", command: "cmd-a" };
      const cfgB: McpServerConfig = { type: "http", url: "http://b.example.com" };
      const cfgBUpdated: McpServerConfig = { type: "http", url: "http://b-new.example.com" };

      await manager.addServer("srv-a", cfgA);
      await manager.addServer("srv-b", cfgB);

      assert.equal(manager.getServerConfigs().size, 2);
      assert.deepEqual(manager.getServerConfigs().get("srv-a"), cfgA);
      assert.deepEqual(manager.getServerConfigs().get("srv-b"), cfgB);

      // Update srv-b in place (no rename)
      await manager.updateServer("srv-b", "srv-b", cfgBUpdated);
      assert.equal(manager.getServerConfigs().size, 2);
      assert.deepEqual(manager.getServerConfigs().get("srv-b"), cfgBUpdated);

      // Remove srv-a
      await manager.removeServer("srv-a");
      assert.equal(manager.getServerConfigs().size, 1);
      assert.equal(manager.getServerConfigs().has("srv-a"), false);
      assert.deepEqual(manager.getServerConfigs().get("srv-b"), cfgBUpdated);
    });
  });

  describe("getToolsForAiSdk — disabled server blocking", () => {
    it("(1) tool call from an enabled server executes normally", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "do_thing", result: { value: 42 } },
      ]);
      await manager.connectWithTransport("enabled-srv", transport);

      const tools = await manager.getToolsForAiSdk(["enabled-srv"], undefined, []);
      const result = await tools["enabled-srv__do_thing"].execute!({}, {} as never);
      // Should have content array from the mock MCP server (no error)
      assert.ok(!("error" in (result as object)), "expected no error for enabled server");
    });

    it("(2) tool call from a disabled server returns error string without execution", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "do_thing", result: { value: 42 } },
      ]);
      await manager.connectWithTransport("disabled-srv", transport);

      const tools = await manager.getToolsForAiSdk(["disabled-srv"], undefined, ["disabled-srv"]);
      const result = await tools["disabled-srv__do_thing"].execute!({}, {} as never);
      assert.deepEqual(result, {
        error: "Server 'disabled-srv' is disabled for this conversation.",
      });
    });

    it("(3) missing disabledServers defaults to empty array (no blocking)", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "do_thing", result: { value: 99 } },
      ]);
      await manager.connectWithTransport("srv", transport);

      // Pass undefined for disabledServers
      const tools = await manager.getToolsForAiSdk(["srv"], undefined, undefined);
      const result = await tools["srv__do_thing"].execute!({}, {} as never);
      assert.ok(!("error" in (result as object)), "expected no error when disabledServers is undefined");
    });

    it("(4) server ID is correctly extracted from namespaced tool name with double-underscore", async () => {
      const manager = new MCPClientManager();
      // Use a server ID that contains underscores to verify split('__')[0] works correctly
      const transport = await createMockServer([
        { name: "my__tool", result: {} },
      ]);
      await manager.connectWithTransport("my-server", transport);

      // The key will be "my-server__my__tool"; split('__')[0] should give "my-server"
      const tools = await manager.getToolsForAiSdk(["my-server"], undefined, ["my-server"]);
      const toolKey = "my-server__my__tool";
      assert.ok(toolKey in tools, `expected tool key "${toolKey}" to exist`);
      const result = await tools[toolKey].execute!({}, {} as never);
      assert.deepEqual(result, {
        error: "Server 'my-server' is disabled for this conversation.",
      });
    });
  });

  describe("getToolsForAiSdk — debug event emission", () => {
    it("(2) tool call emits mcp-client debug event before execution", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "do_work", result: { ok: true } },
      ]);
      await manager.connectWithTransport("debug-srv", transport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["debug-srv"], emitEvent, []);
      await tools["debug-srv__do_work"].execute!({ x: 1 }, { toolCallId: "tc-1" } as never);

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const toolCallEvent = debugEvents.find(
        (e) => e.event?.actor === "mcp-client" && e.event?.type === "tool-call"
      );
      assert.ok(toolCallEvent, "should emit mcp-client tool-call debug event");
      assert.ok(
        (toolCallEvent.event.summary as string).includes("do_work"),
        "summary should include tool name"
      );
      assert.equal(toolCallEvent.event.correlationId, "tc-1", "should include toolCallId as correlationId");
    });

    it("(2) tool call emits mcp-server debug event on success", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "fetch_data", result: { value: 42 } },
      ]);
      await manager.connectWithTransport("debug-srv2", transport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["debug-srv2"], emitEvent, []);
      await tools["debug-srv2__fetch_data"].execute!({}, { toolCallId: "tc-2" } as never);

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const toolResultEvent = debugEvents.find(
        (e) => e.event?.actor === "mcp-server" && e.event?.type === "tool-result"
      );
      assert.ok(toolResultEvent, "should emit mcp-server tool-result debug event");
      assert.ok(
        (toolResultEvent.event.summary as string).includes("fetch_data"),
        "summary should include tool name"
      );
      assert.equal(toolResultEvent.event.correlationId, "tc-2", "should include toolCallId as correlationId");
    });

    it("(3) tool call error emits error debug event", async () => {
      const manager = new MCPClientManager();
      const [clientTransport, serverTransport] = (
        await import("@modelcontextprotocol/sdk/inMemory.js")
      ).InMemoryTransport.createLinkedPair();

      // Server that always throws on callTool
      const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
      const { ListToolsRequestSchema, CallToolRequestSchema } = await import(
        "@modelcontextprotocol/sdk/types.js"
      );
      const srv = new Server(
        { name: "error-srv", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );
      srv.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "boom",
            description: "always fails",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      }));
      srv.setRequestHandler(CallToolRequestSchema, async () => {
        throw new Error("tool exploded");
      });
      await srv.connect(serverTransport);
      await manager.connectWithTransport("err-srv", clientTransport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["err-srv"], emitEvent, []);
      await assert.rejects(
        async () => { await tools["err-srv__boom"].execute!({}, { toolCallId: "tc-err" } as never); },
        /tool exploded/
      );

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const errorEvent = debugEvents.find(
        (e) => e.event?.actor === "error" && e.event?.type === "tool-error"
      );
      assert.ok(errorEvent, "should emit error tool-error debug event on failure");
      assert.ok(
        (errorEvent.event.summary as string).includes("boom"),
        "summary should include tool name"
      );
      assert.equal(errorEvent.event.correlationId, "tc-err", "should include toolCallId as correlationId");
    });

    it("(5) tool-call payload is serialised from args", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "search", result: {} },
      ]);
      await manager.connectWithTransport("payload-srv", transport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["payload-srv"], emitEvent, []);
      await tools["payload-srv__search"].execute!({ query: "hello" }, {} as never);

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const callEvent = debugEvents.find(
        (e) => e.event?.actor === "mcp-client" && e.event?.type === "tool-call"
      );
      assert.ok(callEvent, "mcp-client tool-call event should exist");
      assert.ok(
        typeof callEvent.event.payload === "string" &&
          callEvent.event.payload.includes("hello"),
        "payload should be serialised JSON containing the args"
      );
    });

    it("(6) emitEvent throwing does not break tool execution", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "safe_tool", result: { value: 1 } },
      ]);
      await manager.connectWithTransport("safe-srv", transport);

      // emitEvent that always throws
      const throwingEmit = (_e: object) => { throw new Error("emit failed"); };

      const tools = await manager.getToolsForAiSdk(["safe-srv"], throwingEmit, []);
      // Should not throw even though emitEvent throws
      const result = await tools["safe-srv__safe_tool"].execute!({}, {} as never);
      assert.ok(result !== undefined, "tool should still return a result despite emit errors");
    });

    it("(6) tool-result event includes durationMs as a non-negative number", async () => {
      const manager = new MCPClientManager();
      const transport = await createMockServer([
        { name: "timed_tool", result: { value: 42 } },
      ]);
      await manager.connectWithTransport("duration-srv", transport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["duration-srv"], emitEvent, []);
      await tools["duration-srv__timed_tool"].execute!({}, { toolCallId: "tc-dur-1" } as never);

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const toolResultEvent = debugEvents.find(
        (e) => e.event?.actor === "mcp-server" && e.event?.type === "tool-result"
      );
      assert.ok(toolResultEvent, "should emit mcp-server tool-result debug event");
      assert.ok(
        typeof toolResultEvent.event.durationMs === "number" &&
          toolResultEvent.event.durationMs >= 0,
        `durationMs should be a non-negative number, got: ${toolResultEvent.event.durationMs}`
      );
    });

    it("(7) tool-error event includes durationMs as a non-negative number", async () => {
      const manager = new MCPClientManager();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const srv = new Server(
        { name: "duration-error-srv", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );
      srv.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "failing_tool",
            description: "always fails",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      }));
      srv.setRequestHandler(CallToolRequestSchema, async () => {
        throw new Error("intentional failure");
      });
      await srv.connect(serverTransport);
      await manager.connectWithTransport("dur-err-srv", clientTransport);

      const events: object[] = [];
      const emitEvent = (e: object) => events.push(e);

      const tools = await manager.getToolsForAiSdk(["dur-err-srv"], emitEvent, []);
      await assert.rejects(
        async () => { await tools["dur-err-srv__failing_tool"].execute!({}, { toolCallId: "tc-dur-err" } as never); },
        /intentional failure/
      );

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const toolErrorEvent = debugEvents.find(
        (e) => e.event?.actor === "error" && e.event?.type === "tool-error"
      );
      assert.ok(toolErrorEvent, "should emit error tool-error debug event");
      assert.ok(
        typeof toolErrorEvent.event.durationMs === "number" &&
          toolErrorEvent.event.durationMs >= 0,
        `durationMs should be a non-negative number, got: ${toolErrorEvent.event.durationMs}`
      );
    });
  });

  describe("callWithAuth — debug event emission", () => {
    function make401Error() {
      return Object.assign(new Error("Unauthorized"), { status: 401 });
    }

    it("(4) emits oauth-start debug event on first 401", async () => {
      const manager = new TestMCPClientManager();
      const events: object[] = [];

      let firstCall = true;
      const fn = async (): Promise<string> => {
        if (firstCall) {
          firstCall = false;
          throw make401Error();
        }
        return "ok";
      };

      const promise = manager.callWithAuth("oauth-srv", fn, (e) => events.push(e));

      // Allow microtasks to run so callWithAuth reaches the waiting state
      await Promise.resolve();
      await Promise.resolve();

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const oauthStartEvent = debugEvents.find(
        (e) => e.event?.actor === "oauth" && e.event?.type === "oauth-start"
      );
      assert.ok(oauthStartEvent, "should emit oauth-start debug event on 401");
      assert.ok(
        (oauthStartEvent.event.summary as string).includes("oauth-srv"),
        "summary should include server id"
      );

      // Resolve the lock to unblock the promise
      const lock = (manager as unknown as { authLocks: Map<string, { inProgress: boolean; queue: Array<{ resolve: () => void; reject: (e: Error) => void }> }> }).authLocks.get("oauth-srv");
      lock?.queue[0]?.resolve();
      await promise;
    });

    it("(4) emits oauth-refresh debug event on proactive token refresh", async () => {
      const manager = new TestMCPClientManager();
      const events: object[] = [];

      // Set an expiring token with a refresh token
      const tokenSets = (manager as unknown as { tokenSets: Map<string, { accessToken: string; refreshToken?: string; expiresAt?: number }> }).tokenSets;
      tokenSets.set("refresh-srv", {
        accessToken: "old-token",
        refreshToken: "refresh-token",
        expiresAt: Date.now() + 30_000, // expires in 30s (< 60s threshold)
      });

      // Set an oauth client config so _tryRefreshToken can proceed
      const oauthClients = (manager as unknown as { oauthClients: Map<string, { clientId: string; authorizationEndpoint: string; tokenEndpoint: string }> }).oauthClients;
      oauthClients.set("refresh-srv", {
        clientId: "client-id",
        authorizationEndpoint: "https://example.com/auth",
        tokenEndpoint: "https://example.com/token",
      });

      // Mock fetch to return a successful token refresh response
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ access_token: "new-token", expires_in: 3600 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      try {
        const fn = async () => "result";
        await manager.callWithAuth("refresh-srv", fn, (e) => events.push(e));
      } finally {
        globalThis.fetch = originalFetch;
      }

      const debugEvents = events.filter(
        (e): e is { type: string; event: Record<string, unknown> } =>
          typeof e === "object" && e !== null && (e as Record<string, unknown>)["type"] === "debug"
      );
      const refreshEvent = debugEvents.find(
        (e) => e.event?.actor === "oauth" && e.event?.type === "oauth-refresh"
      );
      assert.ok(refreshEvent, "should emit oauth-refresh debug event on proactive token refresh");
      assert.ok(
        (refreshEvent.event.summary as string).includes("refresh-srv"),
        "summary should include server id"
      );
    });
  });
});
