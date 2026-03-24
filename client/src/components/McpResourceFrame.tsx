import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  serverId: string;
  uri: string;
  onSendMessage: (content: string) => void;
  onUpdateContext: (content: string) => void;
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

export function McpResourceFrame({
  serverId,
  uri,
  onSendMessage,
  onUpdateContext,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const src = `/api/mcp/resource/${encodeURIComponent(serverId)}?uri=${encodeURIComponent(uri)}`;

  const sendToIframe = useCallback((message: JsonRpcMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const handleLoad = useCallback(() => {
    sendToIframe({
      jsonrpc: "2.0",
      method: "ui/ready",
      params: { version: "1.0" },
    });
  }, [sendToIframe]);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      const msg = event.data as JsonRpcMessage;
      if (!msg || msg.jsonrpc !== "2.0") return;

      switch (msg.method) {
        case "requestDisplayMode": {
          const mode = (msg.params as { mode?: string })?.mode;
          if (mode === "fullscreen") {
            setIsFullscreen(true);
            if (msg.id !== undefined) {
              sendToIframe({
                jsonrpc: "2.0",
                id: msg.id,
                result: { mode: "fullscreen" },
              });
            }
          } else {
            setIsFullscreen(false);
            if (msg.id !== undefined) {
              sendToIframe({
                jsonrpc: "2.0",
                id: msg.id,
                result: { mode: mode ?? "inline" },
              });
            }
          }
          break;
        }

        case "ui/message": {
          const content = (
            msg.params as {
              content?: Array<{ type: string; text?: string }>;
            }
          )?.content;
          const text = content?.find((c) => c.type === "text")?.text ?? "";
          onSendMessage(text);
          break;
        }

        case "tools/call": {
          const toolName = (msg.params as { name?: string })?.name ?? "";
          const toolArgs = (msg.params as { arguments?: unknown })?.arguments;
          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "tool_call",
                        toolCallId: "iframe-tool",
                        toolName,
                        args: toolArgs,
                      },
                    ],
                  },
                ],
              }),
            });
            const resultText = await response.text();
            sendToIframe({
              jsonrpc: "2.0",
              method: "ui/notifications/tool-result",
              params: {
                content: [{ type: "text", text: resultText }],
                structuredContent: {},
              },
            });
          } catch (err) {
            sendToIframe({
              jsonrpc: "2.0",
              method: "ui/notifications/tool-result",
              params: {
                content: [
                  { type: "text", text: (err as Error).message },
                ],
                structuredContent: {},
              },
            });
          }
          break;
        }

        case "ui/update-model-context": {
          const content = (
            msg.params as {
              content?: Array<{ type: string; text?: string }>;
            }
          )?.content;
          const text = content?.find((c) => c.type === "text")?.text ?? "";
          onUpdateContext(text);
          break;
        }
      }
    },
    [onSendMessage, onUpdateContext, sendToIframe]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  function handleExitFullscreen() {
    setIsFullscreen(false);
    sendToIframe({
      jsonrpc: "2.0",
      method: "requestDisplayMode",
      params: { mode: "inline" },
    });
  }

  const iframe = (
    <iframe
      ref={iframeRef}
      src={src}
      sandbox="allow-scripts allow-forms allow-same-origin"
      onLoad={handleLoad}
      style={{ width: "100%", height: "100%", border: "none" }}
      title={`MCP Resource: ${uri}`}
    />
  );

  if (isFullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          background: "white",
        }}
        data-testid="fullscreen-overlay"
      >
        <button onClick={handleExitFullscreen} style={{ position: "absolute", top: 8, right: 8, zIndex: 10000 }}>
          Exit fullscreen
        </button>
        {iframe}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "400px" }}>
      <button
        onClick={() => setIsFullscreen(true)}
        style={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}
      >
        Fullscreen
      </button>
      {iframe}
    </div>
  );
}
