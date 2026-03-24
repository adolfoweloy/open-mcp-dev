import type { Conversation } from "./types";

export const STORAGE_KEYS = {
  conversations: "mcp-chat:conversations",
  activeId: "mcp-chat:active-conversation",
} as const;

const MAX_CONVERSATIONS = 50;

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.conversations);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

export function saveConversations(convs: Conversation[]): void {
  // Prune to most recent MAX_CONVERSATIONS (assumed to be front of array = newest)
  const pruned = convs.slice(0, MAX_CONVERSATIONS);
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(pruned));
}

export function loadActiveId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.activeId);
}

export function saveActiveId(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(STORAGE_KEYS.activeId);
  } else {
    localStorage.setItem(STORAGE_KEYS.activeId, id);
  }
}
