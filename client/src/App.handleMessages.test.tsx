/**
 * Tests for conversation isolation and handleMessagesChange guards.
 *
 * Chat is mocked so we can capture the `conversation` and `onMessagesChange`
 * props passed to it without triggering real network requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { App } from "./App";
import type { Conversation } from "./lib/types";
import type { UIMessage } from "ai";

// ---- Mock Chat to capture props ----

let capturedConversation: Conversation | null = null;
let capturedOnMessagesChange: ((msgs: UIMessage[]) => void) | null = null;

vi.mock("./components/Chat", () => ({
  Chat: vi.fn(
    (props: {
      conversation: Conversation;
      onMessagesChange: (msgs: UIMessage[]) => void;
    }) => {
      capturedConversation = props.conversation;
      capturedOnMessagesChange = props.onMessagesChange;
      return (
        <div data-testid="chat" data-conversation-id={props.conversation.id} />
      );
    }
  ),
}));

// ---- Mock API helpers to avoid real fetch calls ----

vi.mock("./lib/api", () => ({
  fetchModels: vi.fn().mockResolvedValue([]),
  fetchServers: vi.fn().mockResolvedValue([]),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
  startOAuthConnect: vi.fn(),
}));

// ---- Constants ----

const CONVERSATIONS_KEY = "mcp-chat:conversations";
const ACTIVE_ID_KEY = "mcp-chat:active-conversation";

// ---- Helpers ----

function makeUserMessage(text: string, id = "msg-1"): UIMessage {
  return {
    id,
    role: "user",
    content: text,
    parts: [{ type: "text", text }],
  } as unknown as UIMessage;
}

function storedConversations(): Conversation[] {
  return JSON.parse(
    localStorage.getItem(CONVERSATIONS_KEY) ?? "[]"
  ) as Conversation[];
}

beforeEach(() => {
  localStorage.clear();
  capturedConversation = null;
  capturedOnMessagesChange = null;
});

// ---- Tests ----

describe("Conversation isolation", () => {
  it("switching conversations passes the correct conversation to Chat (no message bleed)", () => {
    const convs: Conversation[] = [
      {
        id: "conv-a",
        title: "Conv A",
        messages: [makeUserMessage("Hello from A", "msg-a")],
      },
      { id: "conv-b", title: "Conv B", messages: [] },
    ];
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-a");

    render(<App />);

    // Initially Conv A is active — Chat receives its messages
    expect(capturedConversation?.id).toBe("conv-a");
    expect(capturedConversation?.messages).toHaveLength(1);

    // Switch to Conv B
    fireEvent.click(screen.getByRole("button", { name: "Conv B" }));

    // Chat now receives Conv B, which has no messages
    expect(capturedConversation?.id).toBe("conv-b");
    expect(capturedConversation?.messages).toHaveLength(0);
  });

  it("creating a new conversation starts Chat with an empty message list", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "+ New Chat" }));

    expect(capturedConversation?.messages).toEqual([]);
  });
});

describe("handleMessagesChange guards", () => {
  // Requires deleteConversation (not yet implemented). The guard `if (!target)
  // return prev` inside handleMessagesChange ensures stale callbacks from deleted
  // conversations are silently discarded. Enable once deleteConversation exists.
  it.todo(
    "stale onMessagesChange for a deleted conversation is silently ignored"
  );

  it("when isUserRenamed is true, auto-title does not overwrite the user-set title", () => {
    const conv: Conversation = {
      id: "conv-renamed",
      title: "My Custom Title",
      messages: [],
      isUserRenamed: true,
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-renamed");

    render(<App />);

    const newMessages: UIMessage[] = [
      makeUserMessage("This should not become the title"),
    ];
    act(() => {
      capturedOnMessagesChange!(newMessages);
    });

    const stored = storedConversations();
    const updated = stored.find((c) => c.id === "conv-renamed");
    expect(updated?.title).toBe("My Custom Title"); // title preserved
    expect(updated?.messages).toEqual(newMessages); // messages updated
    expect(updated?.isUserRenamed).toBe(true); // flag preserved
  });

  it("when isUserRenamed is false/absent, auto-title derives from first user message", () => {
    const conv: Conversation = {
      id: "conv-auto",
      title: "New Chat",
      messages: [],
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-auto");

    render(<App />);

    const newMessages: UIMessage[] = [
      makeUserMessage("What is the weather like?"),
    ];
    act(() => {
      capturedOnMessagesChange!(newMessages);
    });

    const stored = storedConversations();
    const updated = stored.find((c) => c.id === "conv-auto");
    expect(updated?.title).toBe("What is the weather like?"); // auto-titled
    expect(updated?.messages).toEqual(newMessages);
  });
});
