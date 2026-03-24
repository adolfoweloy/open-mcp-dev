import { useEffect, useRef, useState } from "react";
import { fetchServers, connectServer, disconnectServer, startOAuthConnect } from "../lib/api";
import type { McpServerStatus } from "../lib/types";

const POLL_INTERVAL_MS = 5000;

interface Props {
  selectedServers: string[];
  onToggle: (serverId: string) => void;
}

export function ServerSidebar({ selectedServers, onToggle }: Props) {
  const [servers, setServers] = useState<McpServerStatus[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadServers() {
    try {
      const list = await fetchServers();
      setServers(list);
    } catch (err) {
      console.error("[ServerSidebar] Failed to fetch servers", err);
    }
  }

  useEffect(() => {
    void loadServers();
    intervalRef.current = setInterval(() => void loadServers(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleOAuthConnect(serverId: string) {
    try {
      const result = await startOAuthConnect(serverId);
      if (result.status === "auth_required" && result.authUrl) {
        const popup = window.open(result.authUrl, "_blank", "width=600,height=700");
        const origin = `${window.location.protocol}//${window.location.host}`;
        function messageHandler(event: MessageEvent) {
          if (event.origin !== origin) return;
          if (
            event.data?.type === "oauth_complete" &&
            event.data?.serverId === serverId
          ) {
            window.removeEventListener("message", messageHandler);
            popup?.close();
            void loadServers();
          }
        }
        window.addEventListener("message", messageHandler);
      } else if (result.status === "connected") {
        await loadServers();
      }
    } catch (err) {
      console.error("[ServerSidebar] OAuth connect failed", serverId, err);
    }
  }

  async function handleConnect(serverId: string) {
    try {
      await connectServer(serverId);
      await loadServers();
    } catch (err) {
      console.error("[ServerSidebar] Failed to connect", serverId, err);
    }
  }

  async function handleDisconnect(serverId: string) {
    try {
      await disconnectServer(serverId);
      await loadServers();
    } catch (err) {
      console.error("[ServerSidebar] Failed to disconnect", serverId, err);
    }
  }

  return (
    <div>
      <h3>MCP Servers</h3>
      <ul>
        {servers.map((server) => (
          <li key={server.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedServers.includes(server.id)}
                onChange={() => onToggle(server.id)}
              />
              <span
                style={{ color: server.connected ? "green" : "red" }}
                aria-label={server.connected ? "connected" : "disconnected"}
              >
                {server.id}
              </span>
            </label>
            {server.requiresOAuth && !server.connected && (
              <button onClick={() => void handleOAuthConnect(server.id)}>
                Connect
              </button>
            )}
            {!server.requiresOAuth && !server.connected && (
              <button onClick={() => void handleConnect(server.id)}>
                Reconnect
              </button>
            )}
            {server.connected && (
              <button onClick={() => void handleDisconnect(server.id)}>
                Disconnect
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
