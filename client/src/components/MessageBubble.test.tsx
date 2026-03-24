import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { UIMessage } from "../lib/types";

// Suppress console errors from McpResourceFrame fetch calls in tests
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "" }));

function makeMessage(
  role: "user" | "assistant",
  parts: UIMessage["parts"],
  extra: Record<string, unknown> = {}
): UIMessage {
  return {
    id: "test-id",
    role,
    parts,
    content: "",
    ...extra,
  } as unknown as UIMessage;
}

describe("MessageBubble", () => {
  it("user message is right-aligned", () => {
    const msg = makeMessage("user", [{ type: "text", text: "Hello" }]);
    const { container } = render(<MessageBubble message={msg} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.justifyContent).toBe("flex-end");
  });

  it("assistant message is left-aligned", () => {
    const msg = makeMessage("assistant", [{ type: "text", text: "Hi" }]);
    const { container } = render(<MessageBubble message={msg} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.justifyContent).toBe("flex-start");
  });

  it("text part renders text content", () => {
    const msg = makeMessage("assistant", [{ type: "text", text: "Hello World" }]);
    render(<MessageBubble message={msg} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("tool-invocation part renders ToolCallResult collapsed", () => {
    const msg = makeMessage("assistant", [
      {
        type: "tool-invocation",
        toolInvocation: {
          toolCallId: "call-1",
          toolName: "srv__get_data",
          args: { q: "test" },
          result: { data: [] },
          state: "result",
        },
      } as UIMessage["parts"][0],
    ]);
    render(<MessageBubble message={msg} />);
    // ToolCallResult renders collapsed — shows tool name button
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("get_data")).toBeInTheDocument();
  });

  it("tool-result with HTML resource renders McpResourceFrame", () => {
    const msg = makeMessage("assistant", [
      {
        type: "tool-result",
        content: [{ type: "resource", mimeType: "text/html", uri: "mcp://my-server/page" }],
      } as unknown as UIMessage["parts"][0],
    ]);
    render(<MessageBubble message={msg} />);
    const iframe = screen.getByTitle(/MCP Resource/);
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      expect.stringContaining("my-server")
    );
  });

  it("non-HTML tool-result renders JSON", () => {
    const msg = makeMessage("assistant", [
      {
        type: "tool-result",
        content: [{ type: "text", text: "plain result" }],
      } as unknown as UIMessage["parts"][0],
    ]);
    render(<MessageBubble message={msg} />);
    // Should have a pre with JSON content
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("plain result");
  });

  it("empty parts shows loading indicator", () => {
    const msg = makeMessage("assistant", []);
    render(<MessageBubble message={msg} />);
    expect(screen.getByLabelText("loading")).toBeInTheDocument();
  });

  it("error message styled with different background", () => {
    const msg = makeMessage("assistant", [{ type: "text", text: "Error!" }], {
      isError: true,
    });
    const { container } = render(<MessageBubble message={msg} />);
    const bubble = container.firstElementChild?.firstElementChild as HTMLElement;
    expect(bubble.style.background).toBe("rgb(255, 238, 238)");
  });
});
