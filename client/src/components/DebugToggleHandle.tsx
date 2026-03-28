interface DebugToggleHandleProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function DebugToggleHandle({ isOpen, onToggle }: DebugToggleHandleProps) {
  return (
    <button
      onClick={onToggle}
      title={isOpen ? "Close debug panel" : "Open debug panel"}
      style={{
        width: "12px",
        flexShrink: 0,
        cursor: "pointer",
        background: "#2a2a2a",
        border: "none",
        borderLeft: "1px solid #444",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: "#888",
        fontSize: "10px",
      }}
    >
      {isOpen ? "›" : "‹"}
    </button>
  );
}
