import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage, McpServerStatus } from "./lib/types";
import type { Conversation, ModelSelection } from "./lib/types";
import {
  loadConversations,
  saveConversations,
  loadActiveId,
  saveActiveId,
} from "./lib/storage";
import { ModelSelector } from "./components/ModelSelector";
import { ServerSidebar } from "./components/ServerSidebar";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ServerFormModal } from "./components/ServerFormModal";
import { Chat } from "./components/Chat";
import { ConversationItem } from "./components/ConversationItem";

const TITLE_MAX_LENGTH = 60;

function deriveTitle(messages: UIMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  const textPart = (
    firstUserMsg?.parts as Array<{ type: string; text?: string }> | undefined
  )?.find((p) => p.type === "text");
  return textPart?.text ? textPart.text.slice(0, TITLE_MAX_LENGTH) : "New Chat";
}

export function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => loadActiveId());
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [editServerId, setEditServerId] = useState<string | undefined>(undefined);
  const [servers, setServers] = useState<McpServerStatus[]>([]);

  const activeConversationRef = useRef<Conversation | null>(null);

  if (activeConversationRef.current?.id !== activeConversationId) {
    activeConversationRef.current =
      conversations.find((c) => c.id === activeConversationId) ?? null;
  }
  const activeConversation = activeConversationRef.current;

  function createNewConversation() {
    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
    };
    const updated = [newConv, ...conversations];
    setConversations(updated);
    saveConversations(updated);
    setActiveConversationId(newConv.id);
    saveActiveId(newConv.id);
  }

  function switchConversation(id: string) {
    setActiveConversationId(id);
    saveActiveId(id);
  }

  function renameConversation(id: string, newTitle: string) {
    if (!newTitle.trim()) return;
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === id ? { ...c, title: newTitle.trim(), isUserRenamed: true } : c
      );
      saveConversations(updated);
      return updated;
    });
  }

  function deleteConversation(id: string) {
    let nextId: string | null = null;
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveConversations(updated);
      nextId = updated[0]?.id ?? null;
      return updated;
    });
    setActiveConversationId((currentId) => {
      if (currentId !== id) return currentId;
      saveActiveId(nextId);
      return nextId;
    });
  }

  const handleMessagesChange = useCallback(
    (messages: UIMessage[]) => {
      if (!activeConversationId) return;

      setConversations((prev) => {
        const target = prev.find((c) => c.id === activeConversationId);
        if (!target) return prev; // conversation was deleted — discard update
        if (target.isUserRenamed) {
          const updated = prev.map((c) =>
            c.id === activeConversationId ? { ...c, messages } : c
          );
          saveConversations(updated);
          return updated;
        }
        const title = deriveTitle(messages);
        const updated = prev.map((c) =>
          c.id === activeConversationId ? { ...c, messages, title } : c
        );
        saveConversations(updated);
        return updated;
      });
    },
    [activeConversationId]
  );

  function handleToggleServer(serverId: string) {
    setSelectedServers((prev) =>
      prev.includes(serverId)
        ? prev.filter((id) => id !== serverId)
        : [...prev, serverId]
    );
  }

  function handleServersUpdate(updated: McpServerStatus[]) {
    setServers(updated);
  }

  function handleRequestAddServer() {
    setEditServerId(undefined);
    setFormMode("add");
  }

  function handleRequestEditServer(id: string) {
    setEditServerId(id);
    setFormMode("edit");
  }

  function handleFormClose() {
    setFormMode(null);
    setEditServerId(undefined);
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Left panel */}
      <div
        style={{
          width: "280px",
          borderRight: "1px solid #ddd",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8px" }}>
          <button onClick={createNewConversation} style={{ width: "100%" }}>
            + New Chat
          </button>
        </div>

        <ul
          style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto", flex: 1 }}
        >
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onSelect={switchConversation}
              onRename={renameConversation}
              onDelete={deleteConversation}
            />
          ))}
        </ul>

        <ServerSidebar
          selectedServers={selectedServers}
          onToggle={handleToggleServer}
          onServersUpdate={handleServersUpdate}
        />
        <div style={{ padding: "8px", borderTop: "1px solid #ddd" }}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings"
            title="Server settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "4px",
              lineHeight: 1,
              fontSize: "18px",
              color: "#555",
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        servers={servers}
        onRequestAddServer={handleRequestAddServer}
        onRequestEditServer={handleRequestEditServer}
        onServersChanged={() => {}}
      />
      {formMode !== null && (
        <ServerFormModal
          mode={formMode}
          serverId={editServerId}
          onClose={handleFormClose}
          onSaved={() => {
            handleFormClose();
          }}
        />
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "8px", borderBottom: "1px solid #ddd" }}>
          <ModelSelector value={selectedModel} onSelect={setSelectedModel} />
        </div>

        {activeConversation ? (
          <Chat
            key={activeConversation.id}
            conversation={activeConversation}
            model={selectedModel}
            selectedServers={selectedServers}
            onMessagesChange={handleMessagesChange}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
            }}
          >
            Start a new chat
          </div>
        )}
      </div>
    </div>
  );
}
