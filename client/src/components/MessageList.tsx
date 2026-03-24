import { useEffect, useRef } from "react";
import type { UIMessage } from "../lib/types";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: UIMessage[];
  onSendMessage?: (content: string) => void;
  onUpdateContext?: (content: string) => void;
}

export function MessageList({ messages, onSendMessage, onUpdateContext }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={{ padding: "16px", color: "#888", textAlign: "center" }}>
        No messages yet
      </div>
    );
  }

  return (
    <div style={{ overflowY: "auto", flex: 1 }}>
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onSendMessage={onSendMessage}
          onUpdateContext={onUpdateContext}
        />
      ))}
      <div ref={bottomRef} aria-hidden="true" data-testid="scroll-sentinel" />
    </div>
  );
}
