import type { UIMessage } from "ai";

export type { UIMessage };

export interface ModelInfo {
  provider: "openai" | "ollama";
  id: string;
  label: string;
}

export interface ModelSelection {
  provider: "openai" | "ollama";
  id: string;
}

export type McpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      timeout?: number;
    }
  | {
      type: "http";
      url: string;
      oauth?: boolean;
      client_id?: string;
      client_secret?: string;
      access_token?: string;
      refresh_token?: string;
      prefer_sse?: boolean;
      timeout?: number;
    };

export interface McpServerStatus {
  id: string;
  connected: boolean;
  requiresOAuth: boolean;
  type: "stdio" | "http";
  error?: string;
}

export type ScrubbedMcpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      timeout?: number;
    }
  | {
      type: "http";
      url: string;
      timeout?: number;
      prefer_sse?: boolean;
      oauth?: {
        client_id: string;
        has_client_secret: boolean;
        has_access_token: boolean;
        has_refresh_token: boolean;
      };
    };

export type ServerConfigsResponse = Record<string, ScrubbedMcpServerConfig>;

export interface AddServerRequest {
  id: string;
  config: McpServerConfig;
}

export interface UpdateServerRequest {
  newId?: string;
  config: McpServerConfig;
}

export interface ChatRequest {
  messages: UIMessage[];
  model: ModelSelection;
  selectedServers: string[];
  disabledServers: string[];
}

export interface StreamDebugEvent {
  type: "debug";
  event: {
    id: string;
    timestamp: string;
    actor: string;
    type: string;
    summary: string;
    payload?: string;
    correlationId?: string;
  };
}
