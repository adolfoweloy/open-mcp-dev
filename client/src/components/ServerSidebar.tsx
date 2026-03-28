import type { McpServerStatus } from "../lib/types";

interface Props {
  servers: McpServerStatus[];
  enabledServers: string[];
  onToggle: (serverId: string) => void;
  onOpenSettings: () => void;
}

export function ServerSidebar({
  servers,
  enabledServers,
  onToggle,
  onOpenSettings,
}: Props) {
  return (
    <div>
      <h3>MCP Servers</h3>
      <ul>
        {servers.map((server) => (
          <li key={server.id}>
            <label>
              <input
                type="checkbox"
                checked={enabledServers.includes(server.id)}
                disabled={!server.connected}
                onChange={() => onToggle(server.id)}
              />
              <span
                style={{ color: server.connected ? "green" : "grey" }}
                aria-label={server.connected ? "connected" : "disconnected"}
              >
                {server.id}
              </span>
            </label>
            {server.error && (
              <p className="text-xs text-red-400" style={{ margin: 0 }}>
                {server.error}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div style={{ padding: "8px", borderTop: "1px solid #ddd" }}>
        <button
          onClick={onOpenSettings}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#555", padding: "4px 0" }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
