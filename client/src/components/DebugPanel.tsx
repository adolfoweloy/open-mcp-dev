interface DebugPanelProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (w: number) => void;
}

export function DebugPanel({ width, onClose }: DebugPanelProps) {
  return (
    <div
      style={{
        width: `${width}px`,
        flexShrink: 0,
        borderLeft: "1px solid #444",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#1a1a1a",
      }}
    >
      <div
        style={{
          padding: "8px",
          borderBottom: "1px solid #444",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: "bold", fontSize: "12px" }}>Debug</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#888" }}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px", fontSize: "11px", color: "#666" }}>
        No events yet.
      </div>
    </div>
  );
}
