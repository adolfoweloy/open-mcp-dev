import { useState } from "react";
import ReactDOM from "react-dom";
import { addServer, updateServer } from "../lib/api";
import type { ScrubbedMcpServerConfig, McpServerConfig } from "../../../shared/types";

interface EnvRow {
  key: string;
  value: string;
}

interface Props {
  mode: "add" | "edit";
  serverId?: string;
  initialConfig?: ScrubbedMcpServerConfig;
  onClose: () => void;
  onSaved: () => void;
}

function overlayStyle(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function modalStyle(): React.CSSProperties {
  return {
    background: "#fff",
    borderRadius: "8px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    width: "480px",
    maxWidth: "95vw",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

function fieldStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid #d1d5db",
    borderRadius: "4px",
    fontSize: "13px",
    boxSizing: "border-box",
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: "12px", fontWeight: 500, color: "#374151", marginBottom: "3px", display: "block" };
}

function rowStyle(): React.CSSProperties {
  return { marginBottom: "10px" };
}

function errorStyle(): React.CSSProperties {
  return { fontSize: "11px", color: "#dc2626", marginTop: "2px" };
}

export function ServerFormModal({ mode, serverId, initialConfig, onClose, onSaved }: Props) {
  const isEdit = mode === "edit";

  // Determine initial type
  const initialType: "stdio" | "http" = initialConfig?.type ?? "stdio";

  const [name, setName] = useState(isEdit ? (serverId ?? "") : "");
  const [type, setType] = useState<"stdio" | "http">(initialType);

  // stdio fields
  const [command, setCommand] = useState(
    initialConfig?.type === "stdio" ? initialConfig.command : ""
  );
  const [args, setArgs] = useState(
    initialConfig?.type === "stdio" ? (initialConfig.args ?? []).join(" ") : ""
  );
  const [envRows, setEnvRows] = useState<EnvRow[]>(
    initialConfig?.type === "stdio"
      ? Object.entries(initialConfig.env ?? {}).map(([key, value]) => ({ key, value }))
      : [{ key: "", value: "" }]
  );

  // http fields
  const [url, setUrl] = useState(
    initialConfig?.type === "http" ? initialConfig.url : ""
  );
  const [preferSse, setPreferSse] = useState(
    initialConfig?.type === "http" ? (initialConfig.prefer_sse ?? false) : false
  );
  const [oauthEnabled, setOauthEnabled] = useState(
    initialConfig?.type === "http" ? !!initialConfig.oauth : false
  );
  const [clientId, setClientId] = useState(
    initialConfig?.type === "http" ? (initialConfig.oauth?.client_id ?? "") : ""
  );
  // Sensitive fields: null = unchanged (placeholder shown), "" = cleared, string = new value
  const [clientSecret, setClientSecret] = useState<string | null>(
    isEdit && initialConfig?.type === "http" && initialConfig.oauth?.has_client_secret ? null : ""
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    isEdit && initialConfig?.type === "http" && initialConfig.oauth?.has_access_token ? null : ""
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(
    isEdit && initialConfig?.type === "http" && initialConfig.oauth?.has_refresh_token ? null : ""
  );

  // timeout (shared)
  const [timeout, setTimeout_] = useState(
    initialConfig?.timeout != null ? String(initialConfig.timeout) : ""
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (type === "stdio" && !command.trim()) errs.command = "Command is required";
    if (type === "http") {
      if (!url.trim()) errs.url = "URL is required";
      if (oauthEnabled && !clientId.trim()) errs.clientId = "Client ID is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const timeoutValue = timeout.trim() ? parseInt(timeout.trim(), 10) : undefined;
      let config: McpServerConfig;

      if (type === "stdio") {
        const parsedArgs = args.trim() ? args.trim().split(/\s+/) : undefined;
        const envRecord: Record<string, string> = {};
        for (const row of envRows) {
          if (row.key.trim()) envRecord[row.key.trim()] = row.value;
        }
        config = {
          type: "stdio",
          command: command.trim(),
          ...(parsedArgs ? { args: parsedArgs } : {}),
          ...(Object.keys(envRecord).length > 0 ? { env: envRecord } : {}),
          ...(timeoutValue != null ? { timeout: timeoutValue } : {}),
        };
      } else {
        config = {
          type: "http",
          url: url.trim(),
          ...(preferSse ? { prefer_sse: true } : {}),
          ...(timeoutValue != null ? { timeout: timeoutValue } : {}),
          ...(oauthEnabled
            ? {
                oauth: true,
                client_id: clientId.trim(),
                ...(clientSecret !== null ? { client_secret: clientSecret } : {}),
                ...(accessToken !== null ? { access_token: accessToken } : {}),
                ...(refreshToken !== null ? { refresh_token: refreshToken } : {}),
              }
            : {}),
        };
      }

      if (isEdit && serverId) {
        const newId = name.trim() !== serverId ? name.trim() : undefined;
        await updateServer(serverId, { ...(newId ? { newId } : {}), config });
      } else {
        await addServer(name.trim(), config);
      }

      onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function addEnvRow() {
    setEnvRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function removeEnvRow(idx: number) {
    setEnvRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function updateEnvRow(idx: number, field: "key" | "value", val: string) {
    setEnvRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }

  const modal = (
    <div style={overlayStyle()} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle()} role="dialog" aria-modal="true" aria-label={isEdit ? "Edit server" : "Add server"}>
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
          <span style={{ fontWeight: 600, fontSize: "15px" }}>
            {isEdit ? "Edit Server" : "Add Server"}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "12px" }}>
            Fields are shown in plain text because this is a local-only app.
          </p>

          {/* Name */}
          <div style={rowStyle()}>
            <label style={labelStyle()}>Name *</label>
            <input
              style={fieldStyle()}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-server"
              aria-label="Server name"
            />
            {errors.name && <div style={errorStyle()}>{errors.name}</div>}
          </div>

          {/* Type */}
          <div style={rowStyle()}>
            <label style={labelStyle()}>Type *</label>
            <div style={{ display: "flex", gap: "16px" }}>
              <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px", cursor: isEdit ? "not-allowed" : "pointer", opacity: isEdit ? 0.6 : 1 }}>
                <input
                  type="radio"
                  name="type"
                  value="stdio"
                  checked={type === "stdio"}
                  onChange={() => !isEdit && setType("stdio")}
                  disabled={isEdit}
                />
                stdio
              </label>
              <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "4px", cursor: isEdit ? "not-allowed" : "pointer", opacity: isEdit ? 0.6 : 1 }}>
                <input
                  type="radio"
                  name="type"
                  value="http"
                  checked={type === "http"}
                  onChange={() => !isEdit && setType("http")}
                  disabled={isEdit}
                />
                http
              </label>
            </div>
          </div>

          {/* Timeout */}
          <div style={rowStyle()}>
            <label style={labelStyle()}>Timeout (ms, optional)</label>
            <input
              style={fieldStyle()}
              type="number"
              value={timeout}
              onChange={(e) => setTimeout_(e.target.value)}
              placeholder="e.g. 30000"
              aria-label="Timeout"
            />
          </div>

          {/* stdio fields */}
          {type === "stdio" && (
            <>
              <div style={rowStyle()}>
                <label style={labelStyle()}>Command *</label>
                <input
                  style={fieldStyle()}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  aria-label="Command"
                />
                {errors.command && <div style={errorStyle()}>{errors.command}</div>}
              </div>

              <div style={rowStyle()}>
                <label style={labelStyle()}>Args (space-separated)</label>
                <input
                  style={fieldStyle()}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  aria-label="Args"
                />
              </div>

              <div style={rowStyle()}>
                <label style={labelStyle()}>Environment Variables</label>
                {envRows.map((row, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                    <input
                      style={{ ...fieldStyle(), flex: 1 }}
                      value={row.key}
                      onChange={(e) => updateEnvRow(idx, "key", e.target.value)}
                      placeholder="KEY"
                      aria-label={`Env key ${idx + 1}`}
                    />
                    <span style={{ fontSize: "12px", color: "#9ca3af" }}>=</span>
                    <input
                      style={{ ...fieldStyle(), flex: 2 }}
                      value={row.value}
                      onChange={(e) => updateEnvRow(idx, "value", e.target.value)}
                      placeholder="value"
                      aria-label={`Env value ${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvRow(idx)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "16px", padding: "0 4px" }}
                      aria-label={`Remove env row ${idx + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEnvRow}
                  style={{ fontSize: "12px", padding: "2px 8px", cursor: "pointer", marginTop: "2px" }}
                >
                  + Add variable
                </button>
              </div>
            </>
          )}

          {/* http fields */}
          {type === "http" && (
            <>
              <div style={rowStyle()}>
                <label style={labelStyle()}>URL *</label>
                <input
                  style={fieldStyle()}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  aria-label="URL"
                />
                {errors.url && <div style={errorStyle()}>{errors.url}</div>}
              </div>

              <div style={{ ...rowStyle(), display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  id="prefer-sse"
                  checked={preferSse}
                  onChange={(e) => setPreferSse(e.target.checked)}
                />
                <label htmlFor="prefer-sse" style={{ fontSize: "13px", cursor: "pointer" }}>
                  Prefer SSE transport
                </label>
              </div>

              <div style={{ ...rowStyle(), display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="checkbox"
                  id="oauth-enabled"
                  checked={oauthEnabled}
                  onChange={(e) => setOauthEnabled(e.target.checked)}
                />
                <label htmlFor="oauth-enabled" style={{ fontSize: "13px", cursor: "pointer" }}>
                  OAuth enabled
                </label>
              </div>

              {oauthEnabled && (
                <div style={{ marginLeft: "16px", borderLeft: "2px solid #e5e7eb", paddingLeft: "12px" }}>
                  <div style={rowStyle()}>
                    <label style={labelStyle()}>Client ID *</label>
                    <input
                      style={fieldStyle()}
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="client_id"
                      aria-label="Client ID"
                    />
                    {errors.clientId && <div style={errorStyle()}>{errors.clientId}</div>}
                  </div>

                  <div style={rowStyle()}>
                    <label style={labelStyle()}>Client Secret (optional)</label>
                    <input
                      style={fieldStyle()}
                      value={clientSecret ?? ""}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder={clientSecret === null ? "(saved)" : ""}
                      onFocus={() => { if (clientSecret === null) setClientSecret(""); }}
                      aria-label="Client Secret"
                    />
                    {isEdit && clientSecret === null && (
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                        Leave blank to keep existing value
                      </div>
                    )}
                  </div>

                  <div style={rowStyle()}>
                    <label style={labelStyle()}>Access Token (optional)</label>
                    <input
                      style={fieldStyle()}
                      value={accessToken ?? ""}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder={accessToken === null ? "(saved)" : ""}
                      onFocus={() => { if (accessToken === null) setAccessToken(""); }}
                      aria-label="Access Token"
                    />
                    {isEdit && accessToken === null && (
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                        Leave blank to keep existing value
                      </div>
                    )}
                  </div>

                  <div style={rowStyle()}>
                    <label style={labelStyle()}>Refresh Token (optional)</label>
                    <input
                      style={fieldStyle()}
                      value={refreshToken ?? ""}
                      onChange={(e) => setRefreshToken(e.target.value)}
                      placeholder={refreshToken === null ? "(saved)" : ""}
                      onFocus={() => { if (refreshToken === null) setRefreshToken(""); }}
                      aria-label="Refresh Token"
                    />
                    {isEdit && refreshToken === null && (
                      <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                        Leave blank to keep existing value
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {submitError && (
            <div style={{ ...errorStyle(), marginBottom: "10px", padding: "6px 8px", background: "#fee2e2", borderRadius: "4px" }}>
              {submitError}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "6px 16px", cursor: "pointer", fontSize: "13px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "6px 16px",
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: "13px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Saving…" : isEdit ? "Save" : "Add Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
