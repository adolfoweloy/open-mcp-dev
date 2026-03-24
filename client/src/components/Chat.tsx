import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "../lib/types";
import type { Conversation } from "../lib/types";
import type { ModelSelection } from "../lib/types";
import { MessageList } from "./MessageList";
import { OAuthBanner } from "./OAuthBanner";

interface Props {
  conversation: Conversation | null;
  model: ModelSelection | null;
  selectedServers: string[];
  onMessagesChange: (messages: UIMessage[]) => void;
}

export function Chat({
  conversation,
  model,
  selectedServers,
  onMessagesChange,
}: Props) {
  const [oauthBannerServerId, setOauthBannerServerId] = useState<string | null>(null);

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

  // Expose append for external use (e.g. McpResourceFrame ui/message)
  const appendRef = useRef(append);
  appendRef.current = append;

  // Notify parent on every message change
  useEffect(() => {
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
