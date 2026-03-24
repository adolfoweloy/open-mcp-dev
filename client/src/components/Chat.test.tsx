import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Chat } from "./Chat";
import type { Conversation } from "../lib/types";

// Mock OAuthBanner to keep tests focused on Chat behavior
vi.mock("./OAuthBanner", () => ({
  OAuthBanner: ({ serverId, onDismiss }: { serverId: string; onDismiss: () => void }) => (
    <div data-testid="oauth-banner" data-server-id={serverId}>
      <button onClick={onDismiss}>Dismiss Banner</button>
    </div>
  ),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// We need to mock @ai-sdk/react's useChat
vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "@ai-sdk/react";
const mockUseChat = vi.mocked(useChat);

function makeDefaultUseChat(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    input: "",
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    error: null,
    append: vi.fn(),
    ...overrides,
  };
}

const conversation: Conversation = {
  id: "conv-1",
  title: "Test",
  messages: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Chat", () => {
  it("renders textarea and Send button", () => {
    mockUseChat.mockReturnValue(makeDefaultUseChat() as unknown as ReturnType<typeof useChat>);
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("textarea is disabled while loading", () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ isLoading: true }) as unknown as ReturnType<typeof useChat>
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("Enter key submits, Shift+Enter inserts newline (does not submit)", () => {
    const handleSubmit = vi.fn();
    const handleInputChange = vi.fn();
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ handleSubmit, handleInputChange, input: "hello" }) as unknown as ReturnType<
        typeof useChat
      >
    );

    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );

    const textarea = screen.getByRole("textbox");

    // Shift+Enter should NOT submit
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(handleSubmit).not.toHaveBeenCalled();

    // Enter (without shift) should submit
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(handleSubmit).toHaveBeenCalled();
  });

  it("streaming error shown inline in message thread", () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ error: new Error("stream failed") }) as unknown as ReturnType<
        typeof useChat
      >
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    expect(screen.getByText("Error: stream failed")).toBeInTheDocument();
  });

  it("onMessagesChange called on each update", async () => {
    const onMessagesChange = vi.fn();
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        messages: [
          {
            id: "m1",
            role: "assistant",
            content: "",
            parts: [{ type: "text", text: "Hello" }],
          },
        ],
      }) as unknown as ReturnType<typeof useChat>
    );

    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={onMessagesChange}
      />
    );

    await waitFor(() => {
      expect(onMessagesChange).toHaveBeenCalled();
    });
  });

  it("model and selectedServers passed to useChat body", () => {
    mockUseChat.mockReturnValue(makeDefaultUseChat() as unknown as ReturnType<typeof useChat>);
    const model = { provider: "ollama" as const, id: "llama3" };
    const selectedServers = ["server-a", "server-b"];

    render(
      <Chat
        conversation={conversation}
        model={model}
        selectedServers={selectedServers}
        onMessagesChange={() => {}}
      />
    );

    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ model, selectedServers }),
      })
    );
  });

  it("no banner shown when no auth_required data part received", () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ data: [] }) as unknown as ReturnType<typeof useChat>
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    expect(screen.queryByTestId("oauth-banner")).not.toBeInTheDocument();
  });

  it("auth_required data part causes OAuthBanner to render with correct serverId", async () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [{ type: "auth_required", serverId: "foo" }],
      }) as unknown as ReturnType<typeof useChat>
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("oauth-banner")).toBeInTheDocument();
      expect(screen.getByTestId("oauth-banner")).toHaveAttribute("data-server-id", "foo");
    });
  });

  it("OAuthBanner onDismiss hides the banner", async () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [{ type: "auth_required", serverId: "foo" }],
      }) as unknown as ReturnType<typeof useChat>
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("oauth-banner")).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByText("Dismiss Banner"));
    });

    expect(screen.queryByTestId("oauth-banner")).not.toBeInTheDocument();
  });

  it("second auth_required event for different serverId replaces current banner", async () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [
          { type: "auth_required", serverId: "server-a" },
          { type: "auth_required", serverId: "server-b" },
        ],
      }) as unknown as ReturnType<typeof useChat>
    );
    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("oauth-banner")).toHaveAttribute("data-server-id", "server-b");
    });
  });
});
