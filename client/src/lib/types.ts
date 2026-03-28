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
}
