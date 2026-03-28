/**
 * Tests for App enabledServers wiring:
 * - new conversation defaults enabledServers to all connected servers
 * - toggling a server updates enabledServers on the conversation and persists to localStorage
 * - switching conversations restores that conversation's enabledServers
 * - absence of enabledServers on a loaded conversation defaults to all connected
 * - disabledServers is correctly derived as connected minus enabled
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";
import type { Conversation } from "./lib/types";
import type { McpServerStatus } from "./lib/types";

// ---- Mock Chat to capture disabledServers prop ----

let capturedDisabledServers: string[] | undefined;

vi.mock("./components/Chat", () => ({
  Chat: vi.fn((props: { disabledServers?: string[] }) => {
    capturedDisabledServers = props.disabledServers;
    return <div data-testid="chat" />;
  }),
}));

// ---- Mock API helpers ----

vi.mock("./lib/api", () => ({
  fetchModels: vi.fn().mockResolvedValue([]),
  fetchServers: vi.fn(),
  fetchServerConfigs: vi.fn().mockResolvedValue({}),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
  startOAuthConnect: vi.fn(),
  deleteServer: vi.fn(),
  addServer: vi.fn(),
  updateServer: vi.fn(),
}));

import { fetchServers } from "./lib/api";
const mockFetchServers = vi.mocked(fetchServers);

function makeServer(id: string, connected = true): McpServerStatus {
  return { id, connected, requiresOAuth: false, type: "stdio" };
}

const CONVERSATIONS_KEY = "mcp-chat:conversations";
const ACTIVE_ID_KEY = "mcp-chat:active-conversation";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  capturedDisabledServers = undefined;
  vi.clearAllMocks();
  mockFetchServers.mockResolvedValue([]);
});

describe("App enabledServers wiring", () => {
  it("new conversation defaults enabledServers to all connected servers", async () => {
    mockFetchServers.mockResolvedValue([makeServer("srv-a"), makeServer("srv-b")]);

    render(<App />);

    // Wait for servers to load via ServerSidebar → onServersUpdate
    await waitFor(() => screen.getByText("srv-a"));

    // Create a new conversation
    fireEvent.click(screen.getByRole("button", { name: "+ New Chat" }));

    // Both connected server checkboxes should be checked (default = all connected)
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((cb) => cb.checked)).toBe(true);
  });

  it("toggling a server updates enabledServers on the conversation and persists to localStorage", async () => {
    mockFetchServers.mockResolvedValue([makeServer("srv-a")]);

    render(<App />);
    await waitFor(() => screen.getByText("srv-a"));

    // Create a new conversation
    fireEvent.click(screen.getByRole("button", { name: "+ New Chat" }));
    const convId = localStorage.getItem(ACTIVE_ID_KEY);
    expect(convId).toBeTruthy();

    // srv-a should be checked initially (defaults to all connected)
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Uncheck srv-a
    fireEvent.click(checkbox);

    // enabledServers should be persisted as empty array
    const convs = JSON.parse(
      localStorage.getItem(CONVERSATIONS_KEY) ?? "[]"
    ) as Conversation[];
    const conv = convs.find((c) => c.id === convId);
    expect(conv?.enabledServers).toEqual([]);
  });

  it("switching conversations restores that conversation's enabledServers", async () => {
    mockFetchServers.mockResolvedValue([makeServer("srv-a")]);

    const convs: Conversation[] = [
      { id: "conv-a", title: "Conv A", messages: [], enabledServers: [] },
      { id: "conv-b", title: "Conv B", messages: [] }, // no enabledServers → defaults to all connected
    ];
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-a");

    render(<App />);
    await waitFor(() => screen.getByText("srv-a"));

    // conv-a has enabledServers: [] → srv-a unchecked
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Switch to conv-b (no enabledServers → defaults to all connected)
    fireEvent.click(screen.getByRole("button", { name: "Conv B" }));

    await waitFor(() => {
      expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    });
  });

  it("absence of enabledServers on a loaded conversation defaults to all connected", async () => {
    mockFetchServers.mockResolvedValue([makeServer("srv-x")]);

    const convs: Conversation[] = [
      { id: "conv-1", title: "Conv 1", messages: [] }, // no enabledServers field
    ];
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-1");

    render(<App />);
    await waitFor(() => screen.getByText("srv-x"));

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("disabledServers is correctly derived as connected minus enabled", async () => {
    mockFetchServers.mockResolvedValue([makeServer("srv-a"), makeServer("srv-b")]);

    const convs: Conversation[] = [
      // srv-a enabled, srv-b disabled → disabledServers should be ['srv-b']
      { id: "conv-1", title: "Conv 1", messages: [], enabledServers: ["srv-a"] },
    ];
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-1");

    render(<App />);

    // Wait for servers to load and Chat to re-render with updated disabledServers
    await waitFor(() => {
      expect(capturedDisabledServers).toEqual(["srv-b"]);
    });
  });
});
