import { randomBytes, createHash } from "crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToolSet } from "ai";
import { jsonSchema } from "ai";
import type { McpServerConfig } from "../config.js";
import type { McpServerStatus } from "../../shared/types.js";

export class OAuthDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthDiscoveryError";
  }
}

export class OAuthRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthRegistrationError";
  }
}

export interface OAuthClientConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // Date.now() ms
}

export interface AuthLock {
  inProgress: boolean;
  queue: Array<{ resolve: () => void; reject: (err: Error) => void }>;
}

export interface PendingAuthState {
  serverId: string;
  codeVerifier: string;
  expiresAt: number; // Date.now() ms, TTL = 10 min
}

function is401Error(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  if (e["status"] === 401 || e["statusCode"] === 401) return true;
  const res = e["response"];
  if (typeof res === "object" && res !== null) {
    return (res as Record<string, unknown>)["status"] === 401;
  }
  return false;
}

export class MCPClientManager {
  private clients = new Map<string, Client>();
  private pending = new Map<string, Promise<void>>();
  private oauthClients = new Map<string, OAuthClientConfig>();
  private tokenSets = new Map<string, OAuthTokenSet>();
  private authLocks = new Map<string, AuthLock>();
  private pendingStates = new Map<string, PendingAuthState>();
  private oauthServerUrls = new Map<string, string>();

  async connectToServer(
    id: string,
    serverConfig: McpServerConfig,
    accessToken?: string
  ): Promise<void> {
    // Deduplicate in-flight connects
    const inflight = this.pending.get(id);
    if (inflight) return inflight;

    const promise = this._doConnect(id, serverConfig, accessToken).finally(() =>
      this.pending.delete(id)
    );
    this.pending.set(id, promise);
    return promise;
  }

  /** Connect using a pre-built transport — useful for testing. */
  async connectWithTransport(id: string, transport: Transport): Promise<void> {
    if (this.clients.has(id)) {
      await this.disconnectServer(id);
    }
    const client = new Client({ name: "mcp-chat", version: "1.0.0" });
    await client.connect(transport);
    console.log(`[mcp-manager] Connected to "${id}" (transport injection)`);
    this.clients.set(id, client);
  }

  private async _doConnect(
    id: string,
    serverConfig: McpServerConfig,
    accessToken?: string
  ): Promise<void> {
    // Disconnect existing client if any
    if (this.clients.has(id)) {
      await this.disconnectServer(id);
    }

    const client = new Client({ name: "mcp-chat", version: "1.0.0" });

    if (serverConfig.type === "stdio") {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env
          ? { ...process.env, ...serverConfig.env } as Record<string, string>
          : undefined,
      });
      await client.connect(transport);
    } else {
      // HTTP: try StreamableHTTP first, fall back to SSE
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      let connected = false;
      try {
        const transport = new StreamableHTTPClientTransport(
          new URL(serverConfig.url),
          { requestInit: { headers } }
        );
        await client.connect(transport);
        connected = true;
      } catch (err) {
        console.warn(
          `[mcp-manager] StreamableHTTP failed for "${id}", falling back to SSE:`,
          (err as Error).message
        );
      }

      if (!connected) {
        const transport = new SSEClientTransport(new URL(serverConfig.url), {
          requestInit: { headers },
        });
        await client.connect(transport);
      }
    }

    console.log(`[mcp-manager] Connected to "${id}"`);
    this.clients.set(id, client);
  }

  async prepareOAuthFlow(
    serverId: string,
    serverUrl: string,
    port: number
  ): Promise<string> {
    const TIMEOUT_MS = 5000;

    const fetchWithTimeout = async (
      url: string,
      options?: RequestInit
    ): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    };

    interface AuthServerMetadata {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint?: string;
      scopes_supported?: string[];
    }

    this.oauthServerUrls.set(serverId, serverUrl);
    console.info(
      `[mcp-manager] [${serverId}] Starting OAuth discovery from ${serverUrl}`
    );

    // Step 1: MCP spec discovery — GET serverUrl, inspect WWW-Authenticate header
    let metadata: AuthServerMetadata | null = null;
    try {
      const response = await fetchWithTimeout(serverUrl);
      const wwwAuth = response.headers.get("WWW-Authenticate");
      if (wwwAuth) {
        const resourceMetadataMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
        const asMatch = wwwAuth.match(/\bas="([^"]+)"/);
        const metadataUrl = resourceMetadataMatch?.[1] ?? asMatch?.[1] ?? null;
        if (metadataUrl) {
          const metaResponse = await fetchWithTimeout(metadataUrl);
          if (metaResponse.ok) {
            metadata = (await metaResponse.json()) as AuthServerMetadata;
          }
        }
      }
    } catch {
      // Fall through to RFC 8414 fallback
    }

    // Step 2: RFC 8414 fallback
    if (!metadata?.authorization_endpoint || !metadata?.token_endpoint) {
      console.info(
        `[mcp-manager] [${serverId}] MCP spec discovery failed, trying RFC 8414 fallback`
      );
      try {
        const origin = new URL(serverUrl).origin;
        const fallbackUrl = `${origin}/.well-known/oauth-authorization-server`;
        const response = await fetchWithTimeout(fallbackUrl);
        if (response.ok) {
          metadata = (await response.json()) as AuthServerMetadata;
        }
      } catch {
        // Both methods failed
      }
    }

    // Step 3: Both failed
    if (!metadata?.authorization_endpoint || !metadata?.token_endpoint) {
      throw new OAuthDiscoveryError(
        `OAuth metadata discovery failed for server "${serverId}". Unable to find authorization server metadata.`
      );
    }

    const {
      authorization_endpoint,
      token_endpoint,
      registration_endpoint,
      scopes_supported,
    } = metadata;

    // Step 4: Skip registration if already registered this session
    if (!this.oauthClients.has(serverId)) {
      if (!registration_endpoint) {
        throw new OAuthDiscoveryError(
          `OAuth registration endpoint not found for server "${serverId}".`
        );
      }

      // Step 5: POST registration_endpoint
      console.info(`[mcp-manager] [${serverId}] Registering OAuth client`);
      let regResponse: Response;
      try {
        regResponse = await fetchWithTimeout(registration_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: "MCP Chat",
            redirect_uris: [`http://localhost:${port}/oauth/callback`],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
          }),
        });
      } catch (err) {
        throw new OAuthRegistrationError(
          `OAuth client registration timed out or failed for server "${serverId}": ${(err as Error).message}`
        );
      }

      if (!regResponse.ok) {
        throw new OAuthRegistrationError(
          `OAuth client registration failed for server "${serverId}": HTTP ${regResponse.status}`
        );
      }

      const regData = (await regResponse.json()) as { client_id: string };
      this.oauthClients.set(serverId, {
        clientId: regData.client_id,
        authorizationEndpoint: authorization_endpoint,
        tokenEndpoint: token_endpoint,
      });
    }

    const clientConfig = this.oauthClients.get(serverId)!;

    // Step 6: Generate PKCE
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    // Step 7: Generate state
    const state = randomBytes(16).toString("base64url");

    // Step 8: Store PendingAuthState (TTL = 10 min)
    this.pendingStates.set(state, {
      serverId,
      codeVerifier,
      expiresAt: Date.now() + 600_000,
    });

    // Step 9: Construct authorization URL
    console.info(`[mcp-manager] [${serverId}] Constructing authorization URL`);
    const authUrl = new URL(clientConfig.authorizationEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientConfig.clientId);
    authUrl.searchParams.set(
      "redirect_uri",
      `http://localhost:${port}/oauth/callback`
    );
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    if (scopes_supported && scopes_supported.length > 0) {
      authUrl.searchParams.set("scope", scopes_supported.join(" "));
    }

    return authUrl.toString();
  }

  async completeOAuthFlow(
    serverId: string,
    tokenSet: OAuthTokenSet
  ): Promise<void> {
    this.tokenSets.set(serverId, tokenSet);
    console.info(`[mcp-manager] [${serverId}] OAuth flow complete, token received`);

    // Connect transport with the new access token
    const serverUrl = this.oauthServerUrls.get(serverId);
    if (serverUrl) {
      const serverConfig: McpServerConfig = { type: "http", url: serverUrl, oauth: true };
      await this.connectToServer(serverId, serverConfig, tokenSet.accessToken);
    }

    // Resolve all queued callbacks
    const lock = this.authLocks.get(serverId);
    if (!lock) return;
    const queue = lock.queue.splice(0);
    lock.inProgress = false;
    for (const { resolve } of queue) {
      resolve();
    }
  }

  async callWithAuth<T>(
    serverId: string,
    fn: () => Promise<T>,
    emitEvent?: (event: object) => void
  ): Promise<T> {
    // (1) Proactive refresh — if token expires within 60 s
    const tokenSet = this.tokenSets.get(serverId);
    if (
      tokenSet &&
      tokenSet.expiresAt !== undefined &&
      tokenSet.expiresAt - Date.now() < 60_000
    ) {
      if (tokenSet.refreshToken) {
        const existingLock = this.authLocks.get(serverId);
        if (!existingLock || !existingLock.inProgress) {
          console.info(`[mcp-manager] [${serverId}] Token refresh start`);
          await this._tryRefreshToken(serverId, tokenSet);
        }
      }
      // No refresh token → fall through; fn() will likely 401 → full re-auth
    }

    // (2) Call fn()
    try {
      return await fn();
    } catch (err) {
      if (!is401Error(err)) throw err;
    }

    // (3) Handle 401
    let lock = this.authLocks.get(serverId);
    if (!lock) {
      lock = { inProgress: false, queue: [] };
      this.authLocks.set(serverId, lock);
    }

    if (lock.inProgress) {
      // Queue behind existing lock
      console.info(
        `[mcp-manager] [${serverId}] 401 received, queuing behind existing auth lock`
      );
      await new Promise<void>((resolve, reject) => {
        lock!.queue.push({ resolve, reject });
      });
    } else {
      // First 401 — set lock, emit auth_required, queue ourselves
      lock.inProgress = true;
      console.info(
        `[mcp-manager] [${serverId}] 401 received, emitting auth_required`
      );
      emitEvent?.({ type: "auth_required", serverId });
      await new Promise<void>((resolve, reject) => {
        lock!.queue.push({ resolve, reject });
      });
    }

    // Retry fn() after auth completes
    return await fn();
  }

  private async _tryRefreshToken(
    serverId: string,
    tokenSet: OAuthTokenSet
  ): Promise<void> {
    const clientConfig = this.oauthClients.get(serverId);
    if (!clientConfig || !tokenSet.refreshToken) return;

    let lock = this.authLocks.get(serverId);
    if (!lock) {
      lock = { inProgress: false, queue: [] };
      this.authLocks.set(serverId, lock);
    }
    lock.inProgress = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let refreshResponse: Response;
      try {
        refreshResponse = await fetch(clientConfig.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokenSet.refreshToken,
            client_id: clientConfig.clientId,
          }).toString(),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (refreshResponse.ok) {
        const data = (await refreshResponse.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
        };
        const newTokenSet: OAuthTokenSet = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? tokenSet.refreshToken,
          expiresAt: data.expires_in
            ? Date.now() + data.expires_in * 1000
            : undefined,
        };
        this.tokenSets.set(serverId, newTokenSet);
        const serverUrl = this.oauthServerUrls.get(serverId);
        if (serverUrl) {
          const serverConfig: McpServerConfig = {
            type: "http",
            url: serverUrl,
            oauth: true,
          };
          await this.connectToServer(serverId, serverConfig, newTokenSet.accessToken);
        }
        console.info(`[mcp-manager] [${serverId}] Token refresh success`);
        lock.inProgress = false;
        const queue = lock.queue.splice(0);
        for (const { resolve } of queue) resolve();
      } else {
        // Non-2xx — clear refreshToken, fall through to re-auth
        this.tokenSets.set(serverId, { ...tokenSet, refreshToken: undefined });
        console.info(
          `[mcp-manager] [${serverId}] Token refresh failed (non-2xx), will re-auth`
        );
        lock.inProgress = false;
      }
    } catch (err) {
      // Network/timeout error — clear refreshToken, fall through to re-auth
      this.tokenSets.set(serverId, { ...tokenSet, refreshToken: undefined });
      console.info(
        `[mcp-manager] [${serverId}] Token refresh failed: ${(err as Error).message}`
      );
      lock.inProgress = false;
    }
  }

  async failOAuthFlow(serverId: string, error: Error): Promise<void> {
    console.info(
      `[mcp-manager] [${serverId}] OAuth flow failed: ${error.message}`
    );
    const lock = this.authLocks.get(serverId);
    if (!lock) return;
    const queue = lock.queue.splice(0);
    lock.inProgress = false;
    for (const { reject } of queue) {
      reject(error);
    }
  }

  getPendingState(state: string): PendingAuthState | undefined {
    return this.pendingStates.get(state);
  }

  deletePendingState(state: string): void {
    this.pendingStates.delete(state);
  }

  getOAuthClientConfig(serverId: string): OAuthClientConfig | undefined {
    return this.oauthClients.get(serverId);
  }

  async disconnectServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (!client) return;
    this.clients.delete(id);
    try {
      await client.close();
      console.log(`[mcp-manager] Disconnected from "${id}"`);
    } catch (err) {
      console.warn(`[mcp-manager] Error closing "${id}":`, (err as Error).message);
    }
  }

  isConnected(id: string): boolean {
    return this.clients.has(id);
  }

  requiresOAuth(id: string, configs: Record<string, McpServerConfig>): boolean {
    const cfg = configs[id];
    return cfg?.type === "http" && cfg.oauth === true;
  }

  getServerStatuses(configs: Record<string, McpServerConfig>): McpServerStatus[] {
    return Object.keys(configs).map((id) => ({
      id,
      connected: this.isConnected(id),
      requiresOAuth: this.requiresOAuth(id, configs),
      type: configs[id]?.type ?? "stdio",
    }));
  }

  getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }

  async getToolsForAiSdk(
    serverIds?: string[],
    emitEvent?: (event: object) => void
  ): Promise<ToolSet> {
    const ids = serverIds ?? Array.from(this.clients.keys());
    const toolSet: ToolSet = {};

    for (const serverId of ids) {
      const client = this.clients.get(serverId);
      if (!client) continue;

      let tools;
      try {
        const result = await client.listTools();
        tools = result.tools;
      } catch (err) {
        console.error(
          `[mcp-manager] Failed to list tools for "${serverId}":`,
          (err as Error).message
        );
        continue;
      }

      for (const tool of tools) {
        const key = `${serverId}__${tool.name}`;
        // Normalize schema: ensure top-level type: "object" for Anthropic compatibility
        const rawSchema =
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? (tool.inputSchema as Record<string, unknown>)
            : {};
        const schema: Record<string, unknown> = { ...rawSchema };
        if (!schema["type"]) {
          schema["type"] = "object";
        }
        if (!schema["properties"]) {
          schema["properties"] = {};
        }

        toolSet[key] = {
          description: tool.description ?? "",
          parameters: jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
          execute: async (args: unknown) => {
            return this.callWithAuth(
              serverId,
              () =>
                client.callTool({
                  name: tool.name,
                  arguments: args as Record<string, unknown>,
                }),
              emitEvent
            );
          },
        };
      }
    }

    return toolSet;
  }
}
