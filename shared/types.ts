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

export interface McpServerStatus {
  id: string;
  connected: boolean;
  requiresOAuth: boolean;
}

export interface ChatRequest {
  messages: UIMessage[];
  model: ModelSelection;
  selectedServers: string[];
}
