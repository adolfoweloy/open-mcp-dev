import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  describe("scroll behavior", () => {
    it("auto-scrolls to bottom when user has not scrolled up", () => {
      const scrollIntoView = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

      const { rerender } = render(<MessageList messages={[makeMessage("1", "First")]} />);
      expect(scrollIntoView).toHaveBeenCalled();

      scrollIntoView.mockClear();
      rerender(<MessageList messages={[makeMessage("1", "First"), makeMessage("2", "Second")]} />);
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it("does not auto-scroll when user has scrolled up", () => {
      const scrollIntoView = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

      const { rerender } = render(<MessageList messages={[makeMessage("1", "First")]} />);

      const sentinel = screen.getByTestId("scroll-sentinel");
      const container = sentinel.parentElement!;

      Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, configurable: true });
      Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });

      fireEvent.scroll(container);
      scrollIntoView.mockClear();

      rerender(<MessageList messages={[makeMessage("1", "First"), makeMessage("2", "Second")]} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("resumes auto-scroll when user scrolls back near bottom", () => {
      const scrollIntoView = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

      const { rerender } = render(<MessageList messages={[makeMessage("1", "First")]} />);

      const sentinel = screen.getByTestId("scroll-sentinel");
      const container = sentinel.parentElement!;

      // Simulate scrolled up
      Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(container, "scrollTop", { value: 0, configurable: true });
      Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
      fireEvent.scroll(container);
      scrollIntoView.mockClear();

      // Simulate near bottom (distance = 50)
      Object.defineProperty(container, "scrollTop", { value: 450, configurable: true });
      fireEvent.scroll(container);

      rerender(<MessageList messages={[makeMessage("1", "First"), makeMessage("2", "Second")]} />);
      expect(scrollIntoView).toHaveBeenCalled();
    });

    it("threshold boundary: exactly 100px does not resume auto-scroll", () => {
      const scrollIntoView = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

      const { rerender } = render(<MessageList messages={[makeMessage("1", "First")]} />);

      const sentinel = screen.getByTestId("scroll-sentinel");
      const container = sentinel.parentElement!;

      // distance = 1000 - 400 - 500 = 100 (exactly at threshold, not < 100)
      Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(container, "scrollTop", { value: 400, configurable: true });
      Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
      fireEvent.scroll(container);
      scrollIntoView.mockClear();

      rerender(<MessageList messages={[makeMessage("1", "First"), makeMessage("2", "Second")]} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});
