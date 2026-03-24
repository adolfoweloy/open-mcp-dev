import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToolSet } from "ai";
import { jsonSchema } from "ai";
import type { McpServerConfig } from "../config.js";
import type { McpServerStatus } from "../../shared/types.js";

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

export class MCPClientManager {
  private clients = new Map<string, Client>();
  private pending = new Map<string, Promise<void>>();
  private oauthClients = new Map<string, OAuthClientConfig>();
  private tokenSets = new Map<string, OAuthTokenSet>();
  private authLocks = new Map<string, AuthLock>();
  private pendingStates = new Map<string, PendingAuthState>();

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
    }));
  }

  getClient(id: string): Client | undefined {
    return this.clients.get(id);
  }

  async getToolsForAiSdk(serverIds?: string[]): Promise<ToolSet> {
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
            const response = await client.callTool({
              name: tool.name,
              arguments: args as Record<string, unknown>,
            });
            return response;
          },
        };
      }
    }

    return toolSet;
  }
}
