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

  // Separate full-width iframe parts from bubble parts (text, plain tool results)
  const iframeParts: React.ReactNode[] = [];
  const bubbleParts: React.ReactNode[] = [];

  parts.forEach((part, i) => {
    if (part.type === "text") {
      const text = part.text as string;
      if (text?.trim()) {
        bubbleParts.push(<pre key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text}</pre>);
      }
      return;
    }

    if (part.type === "tool-invocation") {
      const inv = part.toolInvocation as {
        toolCallId?: string;
        toolName?: string;
        args?: unknown;
        result?: unknown;
        state?: string;
      };

      if (inv.state === "result" && inv.result) {
        const uiResourceUri = (inv.result as Record<string, unknown>)._uiResourceUri as string | undefined;
        if (uiResourceUri) {
          const serverId = (inv.toolName ?? "").split("__")[0];
          const { _uiResourceUri: _dropped, ...toolResult } = inv.result as Record<string, unknown>;
          iframeParts.push(
            <McpResourceFrame
              key={inv.toolCallId ?? i}
              serverId={serverId}
              uri={uiResourceUri}
              toolArgs={inv.args as Record<string, unknown>}
              toolResult={toolResult}
              onSendMessage={onSendMessage ?? (() => {})}
              onUpdateContext={onUpdateContext ?? (() => {})}
            />
          );
          return;
        }

        const content = (inv.result as { content?: unknown }).content;
        if (isHtmlContent(content)) {
          const resource = extractHtmlResource(content);
          if (resource) {
            iframeParts.push(
              <McpResourceFrame
                key={inv.toolCallId ?? i}
                serverId={resource.serverId}
                uri={resource.uri}
                onSendMessage={onSendMessage ?? (() => {})}
                onUpdateContext={onUpdateContext ?? (() => {})}
              />
            );
            return;
          }
        }
      }

      bubbleParts.push(
        <ToolCallResult
          key={inv.toolCallId ?? i}
          toolName={inv.toolName ?? "unknown"}
          args={inv.args ?? {}}
          result={inv.result ?? null}
          isError={isError}
        />
      );
    }
  });

  if (iframeParts.length === 0 && bubbleParts.length === 0) {
    if (isUser) return null;
    return (
      <div style={containerStyle}>
        <div style={{ ...bubbleStyle, background: "#fff3cd", color: "#856404", fontStyle: "italic", fontSize: "0.9em" }}>
          The model returned an empty response and did not call any tool. This usually means the model tried to call a tool but its output format was not recognised. Check the Debug panel for details.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "4px 0" }}>
      {iframeParts}
      {bubbleParts.length > 0 && (
        <div style={containerStyle}>
          <div style={bubbleStyle}>{bubbleParts}</div>
        </div>
      )}
    </div>
  );
}
