import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "../lib/types";
import type { Conversation } from "../lib/types";
import type { ModelSelection } from "../lib/types";
import { useDebugEmit } from "../lib/debug-context";
import { MessageList } from "./MessageList";
import { OAuthBanner } from "./OAuthBanner";

interface Props {
  conversation: Conversation | null;
  model: ModelSelection | null;
  selectedServers: string[];
  disabledServers?: string[];
  onMessagesChange: (messages: UIMessage[]) => void;
}

export function Chat({
  conversation,
  model,
  selectedServers,
  disabledServers = [],
  onMessagesChange,
}: Props) {
  const [oauthBannerServerId, setOauthBannerServerId] = useState<string | null>(null);
  const { emit } = useDebugEmit();

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
    data,
  } = useChat({
    api: "/api/chat",
    id: conversation?.id,
    initialMessages: conversation?.messages ?? [],
    body: {
      model,
      selectedServers,
      disabledServers,
    },
  });

  // Watch for auth_required data stream events
  useEffect(() => {
    if (!data) return;
    for (const part of data) {
      if (
        part !== null &&
        typeof part === "object" &&
        !Array.isArray(part) &&
        (part as Record<string, unknown>).type === "auth_required" &&
        typeof (part as Record<string, unknown>).serverId === "string"
      ) {
        setOauthBannerServerId((part as Record<string, unknown>).serverId as string);
      }
    }
  }, [data]);

  // Forward debug events from the data stream into DebugContext
  const lastDebugIndexRef = useRef(0);
  useEffect(() => {
    if (!data) return;
    const start = lastDebugIndexRef.current;
    for (let i = start; i < data.length; i++) {
      const part = data[i];
      if (
        part !== null &&
        typeof part === "object" &&
        !Array.isArray(part) &&
        (part as Record<string, unknown>).type === "debug"
      ) {
        const raw = part as Record<string, unknown>;
        const event = raw.event as Record<string, unknown> | undefined;
        if (event && typeof event.timestamp === "string") {
          emit({
            id: event.id as string,
            timestamp: new Date(event.timestamp),
            actor: event.actor as import("../lib/types").DebugActor,
            type: event.type as string,
            summary: event.summary as string,
            payload: event.payload as string | undefined,
            correlationId: event.correlationId as string | undefined,
          });
        }
      }
    }
    lastDebugIndexRef.current = data.length;
  }, [data, emit]);

  // Expose append for external use (e.g. McpResourceFrame ui/message)
  const appendRef = useRef(append);
  appendRef.current = append;

  // Notify parent on every message change (guarded to avoid redundant updates)
  const prevMessagesRef = useRef<UIMessage[]>([]);
  useEffect(() => {
    const prev = prevMessagesRef.current;
    if (
      messages.length === prev.length &&
      (messages.length === 0 ||
        messages[messages.length - 1]?.id === prev[prev.length - 1]?.id)
    ) {
      return;
    }
    prevMessagesRef.current = messages as UIMessage[];
    onMessagesChange(messages as UIMessage[]);
  }, [messages, onMessagesChange]);

  const handleSendMessage = useCallback((content: string) => {
    void appendRef.current({ role: "user", content });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  const displayMessages = messages as UIMessage[];
  const errorMessage = error
    ? ({
        id: "error",
        role: "assistant",
        content: "",
        parts: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      } as unknown as UIMessage)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {oauthBannerServerId !== null && (
        <OAuthBanner
          serverId={oauthBannerServerId}
          onDismiss={() => setOauthBannerServerId(null)}
        />
      )}
      <MessageList
        messages={
          errorMessage
            ? [...displayMessages, errorMessage]
            : displayMessages
        }
        onSendMessage={handleSendMessage}
      />

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", padding: "8px" }}>
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={3}
          style={{ flex: 1, resize: "none" }}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
