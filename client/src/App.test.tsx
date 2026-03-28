import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App } from "./App";

function deleteConv(title: string) {
  const btn = screen.getByRole("button", { name: title });
  const li = btn.closest("li") as HTMLElement;
  fireEvent.mouseEnter(li);
  const meatball = within(li).getByRole("button", { name: "Conversation options" });
  fireEvent.click(meatball);
  const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
  fireEvent.click(deleteItem);
}

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// Mock api helpers
vi.mock("./lib/api", () => ({
  fetchModels: vi.fn().mockResolvedValue([
    { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  ]),
  fetchServers: vi.fn().mockResolvedValue([]),
  fetchServerConfigs: vi.fn().mockResolvedValue({}),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
  startOAuthConnect: vi.fn(),
  deleteServer: vi.fn(),
  addServer: vi.fn(),
  updateServer: vi.fn(),
}));

// Mock useChat to avoid real HTTP requests
vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn().mockReturnValue({
    messages: [],
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    error: null,
    append: vi.fn(),
  }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe("App", () => {
  it("loads conversations from localStorage on mount", () => {
    const convs = [
      { id: "old-1", title: "Old Chat", messages: [] },
    ];
    localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));

    render(<App />);

    expect(screen.getByText("Old Chat")).toBeInTheDocument();
  });

  it("new conversation created and saved when New Chat button clicked", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "+ New Chat" }));

    expect(screen.getByText("New Chat")).toBeInTheDocument();
    const stored = JSON.parse(
      localStorage.getItem("mcp-chat:conversations") ?? "[]"
    ) as Array<{ title: string }>;
    expect(stored.some((c) => c.title === "New Chat")).toBe(true);
  });

  it("switching conversations updates active conversation", () => {
    const convs = [
      { id: "conv-a", title: "Conv A", messages: [] },
      { id: "conv-b", title: "Conv B", messages: [] },
    ];
    localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));

    render(<App />);

    // Click Conv B to switch
    fireEvent.click(screen.getByRole("button", { name: "Conv B" }));

    expect(localStorage.getItem("mcp-chat:active-conversation")).toBe("conv-b");
  });

  it("shows Start a new chat prompt when no conversation is selected", () => {
    render(<App />);
    expect(screen.getByText("Start a new chat")).toBeInTheDocument();
  });

  it("max 50 conversations enforced when saving", () => {
    // Create 55 conversations in localStorage
    const convs = Array.from({ length: 55 }, (_, i) => ({
      id: String(i),
      title: `Conv ${i}`,
      messages: [],
    }));
    localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));

    render(<App />);
    // All 55 loaded, but creating a new one then saving should prune
    fireEvent.click(screen.getByRole("button", { name: "+ New Chat" }));

    const stored = JSON.parse(
      localStorage.getItem("mcp-chat:conversations") ?? "[]"
    ) as unknown[];
    expect(stored.length).toBeLessThanOrEqual(50);
  });

  it("model selector is rendered", async () => {
    render(<App />);
    // ModelSelector fetches models and renders a select
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  describe("gear button", () => {
    it("renders a gear button in the sidebar", () => {
      render(<App />);
      expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
    });

    it("clicking the gear button opens the settings drawer", async () => {
      render(<App />);
      expect(screen.queryByRole("button", { name: "Close settings" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument();
      });
    });
  });

  describe("deleteConversation", () => {
    it("deleting a non-active conversation removes it without changing activeConversationId", () => {
      const convs = [
        { id: "conv-a", title: "Conv A", messages: [] },
        { id: "conv-b", title: "Conv B", messages: [] },
      ];
      localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));
      localStorage.setItem("mcp-chat:active-conversation", "conv-a");

      render(<App />);

      deleteConv("Conv B");

      expect(screen.queryByText("Conv B")).not.toBeInTheDocument();
      expect(screen.getByText("Conv A")).toBeInTheDocument();
      expect(localStorage.getItem("mcp-chat:active-conversation")).toBe("conv-a");

      const stored = JSON.parse(
        localStorage.getItem("mcp-chat:conversations") ?? "[]"
      ) as Array<{ id: string }>;
      expect(stored.find((c) => c.id === "conv-b")).toBeUndefined();
      expect(stored.find((c) => c.id === "conv-a")).toBeDefined();
    });

    it("deleting the active conversation switches to the most recent remaining conversation", () => {
      const convs = [
        { id: "conv-a", title: "Conv A", messages: [] },
        { id: "conv-b", title: "Conv B", messages: [] },
      ];
      localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));
      localStorage.setItem("mcp-chat:active-conversation", "conv-a");

      render(<App />);

      deleteConv("Conv A");

      expect(screen.queryByText("Conv A")).not.toBeInTheDocument();
      expect(localStorage.getItem("mcp-chat:active-conversation")).toBe("conv-b");
    });

    it("deleting the last conversation sets activeConversationId to null", () => {
      const convs = [{ id: "only", title: "Only Chat", messages: [] }];
      localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));
      localStorage.setItem("mcp-chat:active-conversation", "only");

      render(<App />);

      deleteConv("Only Chat");

      expect(screen.queryByText("Only Chat")).not.toBeInTheDocument();
      expect(screen.getByText("Start a new chat")).toBeInTheDocument();
      expect(localStorage.getItem("mcp-chat:active-conversation")).toBeNull();
    });

    it("localStorage reflects deletion after delete", () => {
      const convs = [
        { id: "x", title: "Chat X", messages: [] },
        { id: "y", title: "Chat Y", messages: [] },
      ];
      localStorage.setItem("mcp-chat:conversations", JSON.stringify(convs));
      localStorage.setItem("mcp-chat:active-conversation", "x");

      render(<App />);

      deleteConv("Chat X");

      const stored = JSON.parse(
        localStorage.getItem("mcp-chat:conversations") ?? "[]"
      ) as Array<{ id: string }>;
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe("y");
    });
  });
});
