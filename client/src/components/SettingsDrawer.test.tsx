import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { SettingsDrawer } from "./SettingsDrawer";
import type { McpServerStatus } from "../lib/types";
import type { ServerConfigsResponse } from "../../../shared/types";

vi.mock("../lib/api", () => ({
  fetchServerConfigs: vi.fn(),
  deleteServer: vi.fn(),
  connectServer: vi.fn(),
  disconnectServer: vi.fn(),
  startOAuthConnect: vi.fn(),
}));

import { fetchServerConfigs, deleteServer, connectServer, disconnectServer, startOAuthConnect } from "../lib/api";
const mockFetchConfigs = vi.mocked(fetchServerConfigs);
const mockDeleteServer = vi.mocked(deleteServer);
const mockConnect = vi.mocked(connectServer);
const mockDisconnect = vi.mocked(disconnectServer);
const mockStartOAuthConnect = vi.mocked(startOAuthConnect);

const stdioConfig: ServerConfigsResponse = {
  "my-stdio": { type: "stdio", command: "npx", args: ["-y", "some-mcp"] },
};

const httpConfig: ServerConfigsResponse = {
  "my-http": {
    type: "http",
    url: "http://localhost:8080",
    oauth: { client_id: "abc", has_client_secret: true, has_access_token: false, has_refresh_token: false },
  },
};

const mixedConfigs: ServerConfigsResponse = {
  ...stdioConfig,
  ...httpConfig,
};

function connectedStatus(id: string, type: "stdio" | "http" = "stdio"): McpServerStatus {
  return { id, connected: true, requiresOAuth: false, type };
}

function errorStatus(id: string, error = "timeout"): McpServerStatus {
  return { id, connected: false, requiresOAuth: false, type: "stdio", error };
}

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchConfigs.mockResolvedValue({});
});

describe("SettingsDrawer", () => {
  it("does not render when closed", () => {
    render(
      <SettingsDrawer
        isOpen={false}
        onClose={noop}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );
    expect(screen.queryByText("MCP Servers")).toBeNull();
  });

  it("renders server list with correct names, type badges, and status badges", async () => {
    mockFetchConfigs.mockResolvedValue(mixedConfigs);
    const statuses: McpServerStatus[] = [
      connectedStatus("my-stdio", "stdio"),
      { id: "my-http", connected: false, requiresOAuth: true, type: "http" },
    ];

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={statuses}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("my-stdio")).toBeInTheDocument();
      expect(screen.getByText("my-http")).toBeInTheDocument();
    });

    // type badges
    expect(screen.getByText("stdio")).toBeInTheDocument();
    expect(screen.getByText("http")).toBeInTheDocument();

    // status badges
    expect(screen.getByLabelText("connected")).toBeInTheDocument();
    expect(screen.getByLabelText("connecting")).toBeInTheDocument();
  });

  it("shows error badge with tooltip for errored server", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    const statuses = [errorStatus("my-stdio", "connection refused")];

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={statuses}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));

    const badge = screen.getByLabelText("error: connection refused");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "connection refused");
  });

  it("calls deleteServer on confirm and refreshes list", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    mockDeleteServer.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const onServersChanged = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[connectedStatus("my-stdio")]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={onServersChanged}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteServer).toHaveBeenCalledWith("my-stdio");
      expect(onServersChanged).toHaveBeenCalled();
    });

    // row removed from UI
    expect(screen.queryByText("my-stdio")).toBeNull();
  });

  it("does not call deleteServer if confirm is cancelled", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await act(async () => { await Promise.resolve(); });

    expect(mockDeleteServer).not.toHaveBeenCalled();
  });

  it("calls onRequestAddServer when Add Server clicked", async () => {
    mockFetchConfigs.mockResolvedValue({});
    const onRequestAddServer = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[]}
        onRequestAddServer={onRequestAddServer}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("+ Add Server"));

    fireEvent.click(screen.getByRole("button", { name: "+ Add Server" }));
    expect(onRequestAddServer).toHaveBeenCalled();
  });

  it("calls onRequestEditServer with correct id when Edit clicked", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    const onRequestEditServer = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={onRequestEditServer}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onRequestEditServer).toHaveBeenCalledWith("my-stdio");
  });

  it("closes on clicking outside the drawer", async () => {
    mockFetchConfigs.mockResolvedValue({});
    const onClose = vi.fn();

    const { baseElement } = render(
      <SettingsDrawer
        isOpen={true}
        onClose={onClose}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("MCP Servers"));

    // mousedown outside the drawer panel
    fireEvent.mouseDown(baseElement);

    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the drawer", async () => {
    mockFetchConfigs.mockResolvedValue({});
    const onClose = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={onClose}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("MCP Servers"));

    fireEvent.mouseDown(screen.getByText("MCP Servers"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows Close button which calls onClose", async () => {
    mockFetchConfigs.mockResolvedValue({});
    const onClose = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={onClose}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByLabelText("Close settings"));

    fireEvent.click(screen.getByLabelText("Close settings"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows 'No servers configured' when configs is empty", async () => {
    mockFetchConfigs.mockResolvedValue({});

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("No servers configured"));
  });
});

describe("SettingsDrawer connection controls", () => {
  it("connected server shows Disconnect button", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[connectedStatus("my-stdio")]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("disconnected non-OAuth server shows Reconnect button", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    const disconnected: McpServerStatus = { id: "my-stdio", connected: false, requiresOAuth: false, type: "stdio" };

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[disconnected]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("OAuth server shows Connect button when disconnected", async () => {
    mockFetchConfigs.mockResolvedValue(httpConfig);
    const oauthDisconnected: McpServerStatus = { id: "my-http", connected: false, requiresOAuth: true, type: "http" };

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[oauthDisconnected]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-http"));
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("error state shows Reconnect button and error string", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[errorStatus("my-stdio", "Connection refused")]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={noop}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("clicking Disconnect calls disconnectServer and onServersChanged", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    mockDisconnect.mockResolvedValue(undefined);
    const onServersChanged = vi.fn();

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[connectedStatus("my-stdio")]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={onServersChanged}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalledWith("my-stdio");
      expect(onServersChanged).toHaveBeenCalled();
    });
  });

  it("clicking Reconnect calls connectServer and onServersChanged", async () => {
    mockFetchConfigs.mockResolvedValue(stdioConfig);
    mockConnect.mockResolvedValue(undefined);
    const onServersChanged = vi.fn();
    const disconnected: McpServerStatus = { id: "my-stdio", connected: false, requiresOAuth: false, type: "stdio" };

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[disconnected]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={onServersChanged}
      />
    );

    await waitFor(() => screen.getByText("my-stdio"));
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith("my-stdio");
      expect(onServersChanged).toHaveBeenCalled();
    });
  });

  it("clicking Connect for OAuth server calls startOAuthConnect", async () => {
    mockFetchConfigs.mockResolvedValue(httpConfig);
    mockStartOAuthConnect.mockResolvedValue({ status: "connected" });
    const onServersChanged = vi.fn();
    const oauthDisconnected: McpServerStatus = { id: "my-http", connected: false, requiresOAuth: true, type: "http" };

    render(
      <SettingsDrawer
        isOpen={true}
        onClose={noop}
        servers={[oauthDisconnected]}
        onRequestAddServer={noop}
        onRequestEditServer={noop}
        onServersChanged={onServersChanged}
      />
    );

    await waitFor(() => screen.getByText("my-http"));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockStartOAuthConnect).toHaveBeenCalledWith("my-http");
      expect(onServersChanged).toHaveBeenCalled();
    });
  });
});
