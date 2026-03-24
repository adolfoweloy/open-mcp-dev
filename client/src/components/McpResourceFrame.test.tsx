import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { McpResourceFrame } from "./McpResourceFrame";

// Helper to dispatch a postMessage event from the "iframe"
function dispatchPostMessage(data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data }));
  });
}

const defaultProps = {
  serverId: "my-server",
  uri: "mcp://resource/test",
  onSendMessage: vi.fn(),
  onUpdateContext: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("McpResourceFrame", () => {
  it("renders iframe with correct src including encoded URI", () => {
    render(<McpResourceFrame {...defaultProps} />);
    const iframe = screen.getByTitle(/MCP Resource/);
    expect(iframe).toHaveAttribute(
      "src",
      `/api/mcp/resource/${encodeURIComponent("my-server")}?uri=${encodeURIComponent("mcp://resource/test")}`
    );
  });

  it("iframe has correct sandbox attribute", () => {
    render(<McpResourceFrame {...defaultProps} />);
    const iframe = screen.getByTitle(/MCP Resource/);
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-same-origin");
  });

  it("sends ui/ready message on iframe load", () => {
    const mockPostMessage = vi.fn();
    render(<McpResourceFrame {...defaultProps} />);
    const iframe = screen.getByTitle(/MCP Resource/) as HTMLIFrameElement;

    // Mock iframe contentWindow
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: mockPostMessage },
      writable: true,
    });

    fireEvent.load(iframe);

    expect(mockPostMessage).toHaveBeenCalledWith(
      {
        jsonrpc: "2.0",
        method: "ui/ready",
        params: { version: "1.0" },
      },
      "*"
    );
  });

  it("requestDisplayMode fullscreen mounts fullscreen overlay", () => {
    render(<McpResourceFrame {...defaultProps} />);

    expect(screen.queryByTestId("fullscreen-overlay")).not.toBeInTheDocument();

    dispatchPostMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "requestDisplayMode",
      params: { mode: "fullscreen" },
    });

    expect(screen.getByTestId("fullscreen-overlay")).toBeInTheDocument();
  });

  it("requestDisplayMode inline collapses fullscreen overlay", () => {
    render(<McpResourceFrame {...defaultProps} />);

    // First go fullscreen
    dispatchPostMessage({
      jsonrpc: "2.0",
      method: "requestDisplayMode",
      params: { mode: "fullscreen" },
    });
    expect(screen.getByTestId("fullscreen-overlay")).toBeInTheDocument();

    // Then go inline
    dispatchPostMessage({
      jsonrpc: "2.0",
      method: "requestDisplayMode",
      params: { mode: "inline" },
    });
    expect(screen.queryByTestId("fullscreen-overlay")).not.toBeInTheDocument();
  });

  it("ui/message calls onSendMessage with text content", () => {
    const onSendMessage = vi.fn();
    render(<McpResourceFrame {...defaultProps} onSendMessage={onSendMessage} />);

    dispatchPostMessage({
      jsonrpc: "2.0",
      method: "ui/message",
      params: {
        role: "user",
        content: [{ type: "text", text: "Hello from iframe" }],
      },
    });

    expect(onSendMessage).toHaveBeenCalledWith("Hello from iframe");
  });

  it("tools/call sends fetch request and returns tool-result to iframe", async () => {
    const mockPostMessage = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "tool result text",
    });
    vi.stubGlobal("fetch", mockFetch);

    render(<McpResourceFrame {...defaultProps} />);
    const iframe = screen.getByTitle(/MCP Resource/) as HTMLIFrameElement;
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: mockPostMessage },
      writable: true,
    });

    dispatchPostMessage({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "my_tool", arguments: { x: 1 } },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/chat",
        expect.objectContaining({ method: "POST" })
      );
    });

    vi.unstubAllGlobals();
  });

  it("ui/update-model-context calls onUpdateContext", () => {
    const onUpdateContext = vi.fn();
    render(<McpResourceFrame {...defaultProps} onUpdateContext={onUpdateContext} />);

    dispatchPostMessage({
      jsonrpc: "2.0",
      method: "ui/update-model-context",
      params: {
        content: [{ type: "text", text: "context info" }],
      },
    });

    expect(onUpdateContext).toHaveBeenCalledWith("context info");
  });

  it("manual fullscreen button triggers fullscreen overlay", () => {
    render(<McpResourceFrame {...defaultProps} />);

    const btn = screen.getByRole("button", { name: "Fullscreen" });
    fireEvent.click(btn);

    expect(screen.getByTestId("fullscreen-overlay")).toBeInTheDocument();
  });

  it("exit fullscreen button closes overlay", () => {
    render(<McpResourceFrame {...defaultProps} />);

    // Enter fullscreen
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    expect(screen.getByTestId("fullscreen-overlay")).toBeInTheDocument();

    // Exit
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(screen.queryByTestId("fullscreen-overlay")).not.toBeInTheDocument();
  });
});
