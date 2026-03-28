import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { fetchServerConfigs, deleteServer, connectServer, disconnectServer, startOAuthConnect } from "../lib/api";
import type { McpServerStatus } from "../lib/types";
import type { ScrubbedMcpServerConfig } from "../../../shared/types";

interface ServerRowProps {
  id: string;
  config: ScrubbedMcpServerConfig;
  status: McpServerStatus | undefined;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

function typeBadge(type: "stdio" | "http") {
  return (
    <span
      style={{
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "4px",
        background: type === "stdio" ? "#e0e7ff" : "#dcfce7",
        color: type === "stdio" ? "#3730a3" : "#166534",
        marginLeft: "6px",
      }}
    >
      {type}
    </span>
  );
}

function statusBadge(status: McpServerStatus | undefined) {
  if (!status) {
    return (
      <span
        style={{
          fontSize: "11px",
          padding: "1px 6px",
          borderRadius: "4px",
          background: "#f3f4f6",
          color: "#6b7280",
          marginLeft: "6px",
        }}
      >
        unknown
      </span>
    );
  }

  if (status.connected) {
    return (
      <span
        style={{
          fontSize: "11px",
          padding: "1px 6px",
          borderRadius: "4px",
          background: "#dcfce7",
          color: "#166534",
          marginLeft: "6px",
        }}
        aria-label="connected"
      >
        connected
      </span>
    );
  }

  if (status.error) {
    return (
      <span
        style={{
          fontSize: "11px",
          padding: "1px 6px",
          borderRadius: "4px",
          background: "#fee2e2",
          color: "#991b1b",
          marginLeft: "6px",
          cursor: "help",
        }}
        title={status.error}
        aria-label={`error: ${status.error}`}
      >
        error
      </span>
    );
  }

  return (
    <span
      style={{
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "4px",
        background: "#fef9c3",
        color: "#854d0e",
        marginLeft: "6px",
      }}
      aria-label="connecting"
    >
      connecting
    </span>
  );
}

function ServerRow({ id, config, status, onEdit, onDelete, onRefresh }: ServerRowProps) {
  async function handleOAuthConnect() {
    try {
      const result = await startOAuthConnect(id);
      if (result.status === "auth_required" && result.authUrl) {
        const popup = window.open(result.authUrl, "_blank", "width=600,height=700");
        const origin = `${window.location.protocol}//${window.location.host}`;
        function messageHandler(event: MessageEvent) {
          if (event.origin !== origin) return;
          if (event.data?.type === "oauth_complete" && event.data?.serverId === id) {
            window.removeEventListener("message", messageHandler);
            popup?.close();
            onRefresh();
          }
        }
        window.addEventListener("message", messageHandler);
      } else if (result.status === "connected") {
        onRefresh();
      }
    } catch (err) {
      console.error("[SettingsDrawer] OAuth connect failed", id, err);
    }
  }

  async function handleConnect() {
    try {
      await connectServer(id);
      onRefresh();
    } catch (err) {
      console.error("[SettingsDrawer] Failed to connect", id, err);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectServer(id);
      onRefresh();
    } catch (err) {
      console.error("[SettingsDrawer] Failed to disconnect", id, err);
    }
  }

  const isConnected = status?.connected ?? false;
  const hasError = Boolean(status?.error);
  const requiresOAuth = status?.requiresOAuth ?? false;

  return (
    <div
      style={{
        padding: "8px 12px",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {id}
          </span>
          {typeBadge(config.type)}
          {statusBadge(status)}
        </div>
        <div style={{ display: "flex", gap: "6px", marginLeft: "8px", flexShrink: 0 }}>
          {isConnected && (
            <button
              onClick={() => void handleDisconnect()}
              style={{ fontSize: "12px", padding: "2px 8px", cursor: "pointer" }}
            >
              Disconnect
            </button>
          )}
          {!isConnected && requiresOAuth && (
            <button
              onClick={() => void handleOAuthConnect()}
              style={{ fontSize: "12px", padding: "2px 8px", cursor: "pointer" }}
            >
              Connect
            </button>
          )}
          {!isConnected && !requiresOAuth && (
            <button
              onClick={() => void handleConnect()}
              style={{ fontSize: "12px", padding: "2px 8px", cursor: "pointer" }}
            >
              Reconnect
            </button>
          )}
          <button
            onClick={() => onEdit(id)}
            style={{
              fontSize: "12px",
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(id)}
            style={{
              fontSize: "12px",
              padding: "2px 8px",
              cursor: "pointer",
              color: "#dc2626",
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {hasError && (
        <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#991b1b" }}>
          {status!.error}
        </p>
      )}
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  servers: McpServerStatus[];
  onRequestAddServer: () => void;
  onRequestEditServer: (id: string) => void;
  onServersChanged: () => void;
}

export function SettingsDrawer({
  isOpen,
  onClose,
  servers,
  onRequestAddServer,
  onRequestEditServer,
  onServersChanged,
}: Props) {
  const [configs, setConfigs] = useState<Record<string, ScrubbedMcpServerConfig>>({});
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchServerConfigs()
      .then((data) => setConfigs(data))
      .catch((err) => console.error("[SettingsDrawer] Failed to fetch configs", err));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, onClose]);

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete server "${id}"?`)) return;
    try {
      await deleteServer(id);
      setConfigs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onServersChanged();
    } catch (err) {
      console.error("[SettingsDrawer] Failed to delete server", id, err);
    }
  }

  if (!isOpen) return null;

  const statusById = new Map(servers.map((s) => [s.id, s]));

  const drawer = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "360px",
          background: "#fff",
          borderRight: "1px solid #d1d5db",
          boxShadow: "2px 0 12px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          zIndex: 1001,
          pointerEvents: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "15px" }}>MCP Servers</span>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Add Server button */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={onRequestAddServer}
            style={{
              width: "100%",
              padding: "6px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            + Add Server
          </button>
        </div>

        {/* Server list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {Object.keys(configs).length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                color: "#9ca3af",
                textAlign: "center",
                fontSize: "13px",
              }}
            >
              No servers configured
            </div>
          ) : (
            Object.entries(configs).map(([id, config]) => (
              <ServerRow
                key={id}
                id={id}
                config={config}
                status={statusById.get(id)}
                onEdit={onRequestEditServer}
                onDelete={(sid) => void handleDelete(sid)}
                onRefresh={onServersChanged}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(drawer, document.body);
}
