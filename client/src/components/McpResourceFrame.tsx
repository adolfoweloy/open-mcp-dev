import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  serverId: string;
  uri: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  onSendMessage: (content: string) => void;
  onUpdateContext: (content: string) => void;
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export function McpResourceFrame({
  serverId,
  uri,
  toolArgs,
  toolResult,
  onSendMessage,
  onUpdateContext,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toolArgsRef = useRef(toolArgs);
  const toolResultRef = useRef(toolResult);
  useEffect(() => { toolArgsRef.current = toolArgs; toolResultRef.current = toolResult; }, [toolArgs, toolResult]);

  const src = `/api/mcp/resource/${encodeURIComponent(serverId)}?uri=${encodeURIComponent(uri)}`;

  const sendToIframe = useCallback((message: JsonRpcMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const handleLoad = useCallback(() => {
    // Widget initiates with ui/initialize; we don't need to send anything on load.
  }, []);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data as JsonRpcMessage;
      if (!msg || msg.jsonrpc !== "2.0") return;

      switch (msg.method) {
        case "ui/initialize": {
          sendToIframe({
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: "2025-11-21",
              hostInfo: { name: "mcp-chat", version: "1.0.0" },
              hostCapabilities: {
                serverTools: {},
                updateModelContext: { text: {} },
                message: { text: {} },
              },
              hostContext: {},
            },
          });
          if (toolArgsRef.current !== undefined) {
            sendToIframe({
              jsonrpc: "2.0",
              method: "ui/notifications/tool-input",
              params: { arguments: toolArgsRef.current },
            });
          }
          if (toolResultRef.current !== undefined) {
            sendToIframe({
              jsonrpc: "2.0",
              method: "ui/notifications/tool-result",
              params: toolResultRef.current,
            });
          }
          break;
        }

        case "ui/request-display-mode": {
          const mode = (msg.params as { mode?: string })?.mode;
          if (mode === "fullscreen") {
            setIsFullscreen(true);
          } else {
            setIsFullscreen(false);
          }
          sendToIframe({
            jsonrpc: "2.0",
            id: msg.id,
            result: { mode: mode ?? "inline" },
          });
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
          sendToIframe({ jsonrpc: "2.0", id: msg.id, result: {} });
          break;
        }

        case "tools/call": {
          const toolName = (msg.params as { name?: string })?.name ?? "";
          const toolArgs = (msg.params as { arguments?: unknown })?.arguments;
          try {
            const result = await fetch(
              `/api/mcp/tool/${encodeURIComponent(serverId)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: toolName, arguments: toolArgs }),
              }
            ).then((r) => r.json());
            sendToIframe({ jsonrpc: "2.0", id: msg.id, result });
          } catch (err) {
            sendToIframe({
              jsonrpc: "2.0",
              id: msg.id,
              error: { code: -32000, message: (err as Error).message },
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
          sendToIframe({ jsonrpc: "2.0", id: msg.id, result: {} });
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
