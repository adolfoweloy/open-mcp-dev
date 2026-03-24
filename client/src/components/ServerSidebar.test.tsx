import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { ServerSidebar } from "./ServerSidebar";
import type { McpServerStatus } from "../lib/types";

vi.mock("../lib/api", () => ({
  fetchServers: vi.fn(),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
  startOAuthConnect: vi.fn(),
}));

import { fetchServers, connectServer, disconnectServer, startOAuthConnect } from "../lib/api";
const mockFetchServers = vi.mocked(fetchServers);
const mockConnect = vi.mocked(connectServer);
const mockDisconnect = vi.mocked(disconnectServer);
const mockStartOAuthConnect = vi.mocked(startOAuthConnect);

function connected(id: string, requiresOAuth = false): McpServerStatus {
  return { id, connected: true, requiresOAuth };
}
function disconnectedServer(id: string, requiresOAuth = false): McpServerStatus {
  return { id, connected: false, requiresOAuth };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServerSidebar", () => {
  it("renders server list from API", async () => {
    mockFetchServers.mockResolvedValue([
      connected("server-a"),
      disconnectedServer("server-b"),
    ]);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("server-a")).toBeInTheDocument();
      expect(screen.getByText("server-b")).toBeInTheDocument();
    });
  });

  it("OAuth disconnected server shows Connect button (not a link)", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Connect" });
      expect(btn).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Connect" })).toBeNull();
    });
  });

  it("clicking Connect calls startOAuthConnect with serverId", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);
    mockStartOAuthConnect.mockResolvedValue({ status: "connected" });

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockStartOAuthConnect).toHaveBeenCalledWith("oauth-srv");
    });
  });

  it("on auth_required response, opens popup via window.open with authUrl", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);
    mockStartOAuthConnect.mockResolvedValue({
      status: "auth_required",
      authUrl: "https://auth.example.com/authorize?state=abc",
    });
    const mockOpen = vi.spyOn(window, "open").mockReturnValue(null);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith(
        "https://auth.example.com/authorize?state=abc",
        "_blank",
        "width=600,height=700"
      );
    });

    mockOpen.mockRestore();
  });

  it("postMessage { type: 'oauth_complete', serverId } from correct origin triggers loadServers", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);
    mockStartOAuthConnect.mockResolvedValue({
      status: "auth_required",
      authUrl: "https://auth.example.com/authorize",
    });
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    // Wait for popup to be opened (listener registered)
    await waitFor(() => {
      expect(mockStartOAuthConnect).toHaveBeenCalled();
    });
    // Let the async handler settle
    await act(async () => { await Promise.resolve(); });

    const callsBefore = mockFetchServers.mock.calls.length;

    // Simulate postMessage from the correct origin
    const origin = `${window.location.protocol}//${window.location.host}`;
    await act(async () => {
      const event = new MessageEvent("message", {
        data: { type: "oauth_complete", serverId: "oauth-srv" },
        origin,
      });
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(mockFetchServers.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("on direct 'connected' response, calls loadServers without window.open", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);
    mockStartOAuthConnect.mockResolvedValue({ status: "connected" });
    const mockOpen = vi.spyOn(window, "open").mockReturnValue(null);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Connect" }));
    const callsBefore = mockFetchServers.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockFetchServers.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(mockOpen).not.toHaveBeenCalled();

    mockOpen.mockRestore();
  });

  it("postMessage from wrong origin does not trigger loadServers", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("oauth-srv", true)]);
    mockStartOAuthConnect.mockResolvedValue({
      status: "auth_required",
      authUrl: "https://auth.example.com/authorize",
    });
    vi.spyOn(window, "open").mockReturnValue(null);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await act(async () => { await Promise.resolve(); });

    const callsBefore = mockFetchServers.mock.calls.length;

    await act(async () => {
      const event = new MessageEvent("message", {
        data: { type: "oauth_complete", serverId: "oauth-srv" },
        origin: "https://evil.example.com",
      });
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    // fetchServers should not be called again from the message handler
    expect(mockFetchServers.mock.calls.length).toBe(callsBefore);
  });

  it("non-oauth disconnected server shows Reconnect button", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("plain-srv")]);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    });
  });

  it("connected server shows Disconnect button", async () => {
    mockFetchServers.mockResolvedValue([connected("my-srv")]);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    });
  });

  it("toggle checkbox calls onToggle with correct serverId", async () => {
    mockFetchServers.mockResolvedValue([connected("toggle-srv")]);
    const onToggle = vi.fn();

    render(<ServerSidebar selectedServers={[]} onToggle={onToggle} />);

    await waitFor(() => screen.getByText("toggle-srv"));

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("toggle-srv");
  });

  it("fetch error renders gracefully without crashing", async () => {
    mockFetchServers.mockRejectedValue(new Error("network error"));

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    // Let rejected promise settle
    await act(async () => {
      await Promise.resolve();
    });

    // No crash; sidebar renders (empty list)
    expect(screen.getByText("MCP Servers")).toBeInTheDocument();
  });

  it("Reconnect button calls connectServer", async () => {
    mockFetchServers.mockResolvedValue([disconnectedServer("reconnect-srv")]);
    mockConnect.mockResolvedValue(undefined);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Reconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith("reconnect-srv");
    });
  });

  it("Disconnect button calls disconnectServer", async () => {
    mockFetchServers.mockResolvedValue([connected("dc-srv")]);
    mockDisconnect.mockResolvedValue(undefined);

    render(<ServerSidebar selectedServers={[]} onToggle={() => {}} />);

    await waitFor(() => screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalledWith("dc-srv");
    });
  });
});

describe("ServerSidebar polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("poll interval re-fetches server list", async () => {
    mockFetchServers.mockResolvedValue([connected("srv1")]);

    const { unmount } = render(
      <ServerSidebar selectedServers={[]} onToggle={() => {}} />
    );

    // Let initial fetch resolve
    await act(async () => {
      await Promise.resolve();
    });
    const callsAfterMount = mockFetchServers.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Advance past poll interval and let the next fetch run
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockFetchServers.mock.calls.length).toBeGreaterThan(callsAfterMount);
    unmount();
  });
});
