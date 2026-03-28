interface DebugToggleHandleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DebugToggleHandle({ isOpen, onToggle }: DebugToggleHandleProps) {
  return (
    <button
      onClick={onToggle}
      title={isOpen ? "Close debug panel" : "Open debug panel"}
      data-testid="debug-toggle-handle"
      data-open={isOpen}
      style={{
        flexShrink: 0,
        width: "20px",
        cursor: "pointer",
        background: isOpen ? "rgba(59, 130, 246, 0.08)" : "transparent",
        border: "none",
        borderLeft: "1px solid #333",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 0",
        color: isOpen ? "#60a5fa" : "#555",
        fontSize: "9px",
        fontFamily: "monospace",
        writingMode: "vertical-rl" as const,
        letterSpacing: "0.12em",
        textTransform: "uppercase" as const,
        userSelect: "none" as const,
        transition: "color 0.15s, background 0.15s",
      }}
    >
      debug
    </button>
  );
}
