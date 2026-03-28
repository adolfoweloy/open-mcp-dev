import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { Chat } from "./Chat";
import type { Conversation } from "../lib/types";
import { DebugProvider, useDebugLog } from "../lib/debug-context";

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

  it("disabledServers is included in useChat body", () => {
    mockUseChat.mockReturnValue(makeDefaultUseChat() as unknown as ReturnType<typeof useChat>);
    const disabledServers = ["server-b", "server-c"];

    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={["server-a", "server-b", "server-c"]}
        disabledServers={disabledServers}
        onMessagesChange={() => {}}
      />
    );

    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ disabledServers }),
      })
    );
  });

  it("disabledServers defaults to empty array when not provided", () => {
    mockUseChat.mockReturnValue(makeDefaultUseChat() as unknown as ReturnType<typeof useChat>);

    render(
      <Chat
        conversation={conversation}
        model={{ provider: "openai", id: "gpt-4o" }}
        selectedServers={[]}
        onMessagesChange={() => {}}
      />
    );

    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ disabledServers: [] }),
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

// Helper component to capture emitted debug events
function DebugLogCapture({ onLog }: { onLog: (events: import("../lib/types").DebugEvent[]) => void }) {
  const events = useDebugLog();
  onLog(events);
  return null;
}

describe("Chat debug event ingestion", () => {
  it("debug events in data are forwarded to DebugContext via emit", async () => {
    const isoTimestamp = "2024-01-15T10:30:00.000Z";
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [
          {
            type: "debug",
            event: {
              id: "evt-1",
              timestamp: isoTimestamp,
              actor: "llm",
              type: "request",
              summary: "LLM request",
              payload: '{"model":"gpt-4o"}',
            },
          },
        ],
      }) as unknown as ReturnType<typeof useChat>
    );

    let capturedEvents: import("../lib/types").DebugEvent[] = [];
    render(
      <DebugProvider>
        <Chat
          conversation={conversation}
          model={{ provider: "openai", id: "gpt-4o" }}
          selectedServers={[]}
          onMessagesChange={() => {}}
        />
        <DebugLogCapture onLog={(evts) => { capturedEvents = evts; }} />
      </DebugProvider>
    );

    await waitFor(() => {
      expect(capturedEvents).toHaveLength(1);
    });
    expect(capturedEvents[0].id).toBe("evt-1");
    expect(capturedEvents[0].actor).toBe("llm");
    expect(capturedEvents[0].type).toBe("request");
    expect(capturedEvents[0].summary).toBe("LLM request");
    expect(capturedEvents[0].payload).toBe('{"model":"gpt-4o"}');
  });

  it("timestamp is deserialised from ISO string to Date object", async () => {
    const isoTimestamp = "2024-01-15T10:30:00.000Z";
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [
          {
            type: "debug",
            event: {
              id: "evt-ts",
              timestamp: isoTimestamp,
              actor: "mcp-client",
              type: "tool-call",
              summary: "tool called",
            },
          },
        ],
      }) as unknown as ReturnType<typeof useChat>
    );

    let capturedEvents: import("../lib/types").DebugEvent[] = [];
    render(
      <DebugProvider>
        <Chat
          conversation={conversation}
          model={{ provider: "openai", id: "gpt-4o" }}
          selectedServers={[]}
          onMessagesChange={() => {}}
        />
        <DebugLogCapture onLog={(evts) => { capturedEvents = evts; }} />
      </DebugProvider>
    );

    await waitFor(() => {
      expect(capturedEvents).toHaveLength(1);
    });
    expect(capturedEvents[0].timestamp).toBeInstanceOf(Date);
    expect(capturedEvents[0].timestamp.toISOString()).toBe(isoTimestamp);
  });

  it("non-debug data entries are ignored", async () => {
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({
        data: [
          { type: "auth_required", serverId: "foo" },
          { type: "other", payload: "something" },
        ],
      }) as unknown as ReturnType<typeof useChat>
    );

    let capturedEvents: import("../lib/types").DebugEvent[] = [];
    render(
      <DebugProvider>
        <Chat
          conversation={conversation}
          model={{ provider: "openai", id: "gpt-4o" }}
          selectedServers={[]}
          onMessagesChange={() => {}}
        />
        <DebugLogCapture onLog={(evts) => { capturedEvents = evts; }} />
      </DebugProvider>
    );

    // Give enough time for any effect to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(capturedEvents).toHaveLength(0);
  });

  it("events are not re-emitted on component re-render", async () => {
    const isoTimestamp = "2024-01-15T10:30:00.000Z";
    const dataFixture = [
      {
        type: "debug",
        event: {
          id: "evt-rerender",
          timestamp: isoTimestamp,
          actor: "llm",
          type: "response",
          summary: "done",
        },
      },
    ];

    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ data: dataFixture }) as unknown as ReturnType<typeof useChat>
    );

    let capturedEvents: import("../lib/types").DebugEvent[] = [];
    const { rerender } = render(
      <DebugProvider>
        <Chat
          conversation={conversation}
          model={{ provider: "openai", id: "gpt-4o" }}
          selectedServers={[]}
          onMessagesChange={() => {}}
        />
        <DebugLogCapture onLog={(evts) => { capturedEvents = evts; }} />
      </DebugProvider>
    );

    await waitFor(() => {
      expect(capturedEvents).toHaveLength(1);
    });

    // Re-render with the same data — should not emit again
    mockUseChat.mockReturnValue(
      makeDefaultUseChat({ data: dataFixture }) as unknown as ReturnType<typeof useChat>
    );
    rerender(
      <DebugProvider>
        <Chat
          conversation={conversation}
          model={{ provider: "openai", id: "gpt-4o" }}
          selectedServers={[]}
          onMessagesChange={() => {}}
        />
        <DebugLogCapture onLog={(evts) => { capturedEvents = evts; }} />
      </DebugProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(capturedEvents).toHaveLength(1);
  });
});
