export type {
  ModelInfo,
  ModelSelection,
  McpServerStatus,
  ChatRequest,
  UIMessage,
} from "shared/types";

import type { UIMessage } from "shared/types";

export interface Conversation {
  id: string;
  title: string;
  messages: UIMessage[];
  isUserRenamed?: boolean;
  enabledServers?: string[];
}

export type DebugActor =
  | "llm"
  | "mcp-client"
  | "mcp-server"
  | "oauth"
  | "bridge"
  | "error";

export interface DebugEvent {
  id: string;
  timestamp: Date;
  actor: DebugActor;
  type: string;
  summary: string;
  payload?: string;
  correlationId?: string;
}

export function serializePayload(data: unknown): string {
  if (data === undefined || data === null) return "";
  let raw: string;
  try {
    raw = JSON.stringify(data, null, 2) ?? "";
  } catch {
    return "";
  }
  if (raw.length > 10_240) return raw.slice(0, 10_240) + "\n[TRUNCATED]";
  return raw;
}
