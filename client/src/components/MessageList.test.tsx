import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { UIMessage } from "../lib/types";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeMessage(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    content: "",
    parts: [{ type: "text", text }],
  } as unknown as UIMessage;
}

describe("MessageList", () => {
  it("renders correct number of MessageBubble children", () => {
    const messages = [
      makeMessage("1", "First message"),
      makeMessage("2", "Second message"),
      makeMessage("3", "Third message"),
    ];

    render(<MessageList messages={messages} />);

    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
    expect(screen.getByText("Third message")).toBeInTheDocument();
  });

  it("shows empty state when messages is empty", () => {
    render(<MessageList messages={[]} />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("scroll sentinel element exists at the bottom", () => {
    const messages = [makeMessage("1", "Hello")];
    render(<MessageList messages={messages} />);
    expect(screen.getByTestId("scroll-sentinel")).toBeInTheDocument();
  });

  it("scroll sentinel is not shown when messages is empty", () => {
    render(<MessageList messages={[]} />);
    expect(screen.queryByTestId("scroll-sentinel")).not.toBeInTheDocument();
  });
});
