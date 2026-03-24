import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// Mock api helpers
vi.mock("./lib/api", () => ({
  fetchModels: vi.fn().mockResolvedValue([
    { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  ]),
  fetchServers: vi.fn().mockResolvedValue([]),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
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
});
