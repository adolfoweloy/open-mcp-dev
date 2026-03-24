import type { UIMessage } from "../lib/types";
import { ToolCallResult } from "./ToolCallResult";
import { McpResourceFrame } from "./McpResourceFrame";

interface Props {
  message: UIMessage;
  onSendMessage?: (content: string) => void;
  onUpdateContext?: (content: string) => void;
}

function isHtmlContent(content: unknown): boolean {
  if (typeof content !== "object" || content === null) return false;
  // Array of resource content objects
  if (Array.isArray(content)) {
    return content.some((c) => {
      const item = c as { type?: string; mimeType?: string; uri?: string; data?: string };
      if (item.mimeType === "text/html") return true;
      if (typeof item.uri === "string" && item.uri.startsWith("mcp://")) return true;
      if (typeof item.data === "string" && item.data.startsWith("data:text/html")) return true;
      return false;
    });
  }
  return false;
}

function extractHtmlResource(
  content: unknown
): { serverId: string; uri: string } | null {
  if (!Array.isArray(content)) return null;
  for (const c of content as Array<{ type?: string; mimeType?: string; uri?: string }>) {
    if (c.uri && (c.mimeType === "text/html" || c.uri.startsWith("mcp://"))) {
      // Try to parse serverId from the uri: mcp://<serverId>/...
      const match = c.uri.match(/^mcp:\/\/([^/]+)/);
      const serverId = match?.[1] ?? "unknown";
      return { serverId, uri: c.uri };
    }
  }
  return null;
}

export function MessageBubble({ message, onSendMessage, onUpdateContext }: Props) {
  const isUser = message.role === "user";
  const isError = (message as { isError?: boolean }).isError === true;

  const containerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: isUser ? "flex-end" : "flex-start",
    margin: "4px 0",
  };

  const bubbleStyle: React.CSSProperties = {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: "8px",
    background: isError ? "#fee" : isUser ? "#007bff" : "#f0f0f0",
    color: isUser ? "white" : "black",
  };

  const parts = message.parts as Array<{ type: string; [key: string]: unknown }> | undefined;

  if (!parts || parts.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={bubbleStyle}>
          <span aria-label="loading">...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={bubbleStyle}>
        {parts.map((part, i) => {
          if (part.type === "text") {
            return <pre key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{part.text as string}</pre>;
          }

          if (part.type === "tool-invocation") {
            const inv = part.toolInvocation as {
              toolCallId?: string;
              toolName?: string;
              args?: unknown;
              result?: unknown;
              state?: string;
            };
            return (
              <ToolCallResult
                key={inv.toolCallId ?? i}
                toolName={inv.toolName ?? "unknown"}
                args={inv.args ?? {}}
                result={inv.result ?? null}
                isError={isError}
              />
            );
          }

          if (part.type === "tool-result") {
            const content = part.content as unknown;
            if (isHtmlContent(content)) {
              const resource = extractHtmlResource(content);
              if (resource) {
                return (
                  <McpResourceFrame
                    key={i}
                    serverId={resource.serverId}
                    uri={resource.uri}
                    onSendMessage={onSendMessage ?? (() => {})}
                    onUpdateContext={onUpdateContext ?? (() => {})}
                  />
                );
              }
            }
            return (
              <pre key={i} style={{ margin: 0, fontSize: "0.85em" }}>
                {JSON.stringify(content, null, 2)}
              </pre>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
