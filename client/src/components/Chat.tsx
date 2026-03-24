import { useCallback, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "../lib/types";
import type { Conversation } from "../lib/types";
import type { ModelSelection } from "../lib/types";
import { MessageList } from "./MessageList";

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
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    append,
  } = useChat({
    api: "/api/chat",
    id: conversation?.id,
    initialMessages: conversation?.messages ?? [],
    body: {
      model,
      selectedServers,
    },
  });

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
