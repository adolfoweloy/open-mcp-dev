import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import type { Conversation } from "../lib/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside mousedown
  useEffect(() => {
    if (!menuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleMeatballClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = triggerRef.current?.getBoundingClientRect() ?? null;
    setMenuRect(rect);
    setMenuOpen(true);
  }

  function handleRenameClick() {
    setDraftTitle(conversation.title);
    setRenaming(true);
    setMenuOpen(false);
  }

  function handleDelete() {
    setMenuOpen(false);
    onDelete(conversation.id);
  }

  function handleSaveRename() {
    if (!draftTitle.trim()) return;
    onRename(conversation.id, draftTitle.trim());
    setRenaming(false);
  }

  function handleCancelRename() {
    setRenaming(false);
    setDraftTitle("");
  }

  function handleModalKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveRename();
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  }

  return (
    <li
      style={{ display: "flex", alignItems: "center", position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={() => onSelect(conversation.id)}
        style={{
          flex: 1,
          textAlign: "left",
          padding: "8px",
          background: isActive ? "#e8e8e8" : "transparent",
          border: "none",
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {conversation.title}
      </button>

      <button
        ref={triggerRef}
        aria-label="Conversation options"
        onClick={handleMeatballClick}
        style={{
          visibility: isHovered || menuOpen ? "visible" : "hidden",
          padding: "4px 8px",
          border: "none",
          cursor: "pointer",
          background: "transparent",
          fontSize: "16px",
          lineHeight: 1,
        }}
      >
        ⋯
      </button>

      {menuOpen &&
        menuRect &&
        ReactDOM.createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: menuRect.bottom,
              left: menuRect.left,
              zIndex: 9999,
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              minWidth: "120px",
            }}
          >
            <button
              role="menuitem"
              onClick={handleRenameClick}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Rename
            </button>
            <button
              role="menuitem"
              onClick={handleDelete}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                textAlign: "left",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {renaming &&
        ReactDOM.createPortal(
          <>
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: 9998,
              }}
              onMouseDown={handleCancelRename}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Rename conversation"
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                zIndex: 9999,
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "16px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                minWidth: "300px",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={handleModalKeyDown}
                autoFocus
                style={{ width: "100%", marginBottom: "8px", padding: "4px 8px" }}
              />
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button onClick={handleSaveRename}>Save</button>
                <button onClick={handleCancelRename}>Cancel</button>
              </div>
            </div>
          </>,
          document.body
        )}
    </li>
  );
}
