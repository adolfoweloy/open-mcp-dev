/**
 * Tests for renameConversation in App.tsx.
 *
 * Chat is mocked so we can capture the `onMessagesChange` prop and drive
 * handleMessagesChange directly without triggering real network requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { App } from "./App";
import type { Conversation } from "./lib/types";
import type { UIMessage } from "ai";

// ---- Mock Chat to capture props ----

let capturedOnMessagesChange: ((msgs: UIMessage[]) => void) | null = null;

vi.mock("./components/Chat", () => ({
  Chat: vi.fn(
    (props: {
      conversation: Conversation;
      onMessagesChange: (msgs: UIMessage[]) => void;
    }) => {
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
  capturedOnMessagesChange = null;
});

// ---- Tests ----

describe("renameConversation", () => {
  it("renaming sets the new title and isUserRenamed to true", () => {
    const conv: Conversation = {
      id: "conv-1",
      title: "Old Title",
      messages: [],
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-1");

    render(<App />);

    const input = screen.getByLabelText("Rename input conv-1");
    fireEvent.change(input, { target: { value: "New Title" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Old Title" }));

    const stored = storedConversations();
    const updated = stored.find((c) => c.id === "conv-1");
    expect(updated?.title).toBe("New Title");
    expect(updated?.isUserRenamed).toBe(true);
  });

  it("after rename, handleMessagesChange no longer auto-titles that conversation", () => {
    const conv: Conversation = {
      id: "conv-2",
      title: "Old Title",
      messages: [],
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-2");

    render(<App />);

    // Rename the conversation
    const input = screen.getByLabelText("Rename input conv-2");
    fireEvent.change(input, { target: { value: "My Custom Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Old Title" }));

    // Now trigger handleMessagesChange — should NOT overwrite the custom title
    act(() => {
      capturedOnMessagesChange!([makeUserMessage("This should not become the title")]);
    });

    const stored = storedConversations();
    const updated = stored.find((c) => c.id === "conv-2");
    expect(updated?.title).toBe("My Custom Name");
    expect(updated?.isUserRenamed).toBe(true);
  });

  it("renaming with empty string does not persist (title unchanged)", () => {
    const conv: Conversation = {
      id: "conv-3",
      title: "Keep This Title",
      messages: [],
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-3");

    render(<App />);

    const input = screen.getByLabelText("Rename input conv-3");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Keep This Title" }));

    const stored = storedConversations();
    const updated = stored.find((c) => c.id === "conv-3");
    expect(updated?.title).toBe("Keep This Title");
    expect(updated?.isUserRenamed).toBeUndefined();
  });

  it("localStorage is updated with the new title after rename", () => {
    const conv: Conversation = {
      id: "conv-4",
      title: "Before Rename",
      messages: [],
    };
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify([conv]));
    localStorage.setItem(ACTIVE_ID_KEY, "conv-4");

    render(<App />);

    const input = screen.getByLabelText("Rename input conv-4");
    fireEvent.change(input, { target: { value: "After Rename" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Before Rename" }));

    const stored = storedConversations();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("After Rename");
    expect(stored[0].isUserRenamed).toBe(true);
  });
});
