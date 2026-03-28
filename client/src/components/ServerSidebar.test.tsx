import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ServerSidebar } from "./ServerSidebar";
import type { McpServerStatus } from "../lib/types";

function connected(id: string, opts: Partial<McpServerStatus> = {}): McpServerStatus {
  return { id, connected: true, requiresOAuth: false, type: "stdio", ...opts };
}
function disconnectedServer(id: string, opts: Partial<McpServerStatus> = {}): McpServerStatus {
  return { id, connected: false, requiresOAuth: false, type: "stdio", ...opts };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServerSidebar", () => {
  it("checkbox is checked for enabled servers and unchecked for disabled", () => {
    const servers = [connected("server-a"), connected("server-b")];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={["server-a"]}
        onToggle={() => {}}
        onOpenSettings={() => {}}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();   // server-a enabled
    expect(checkboxes[1]).not.toBeChecked(); // server-b disabled
  });

  it("checkbox is disabled and greyed when server is not connected", () => {
    const servers = [disconnectedServer("offline-srv")];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={[]}
        onToggle={() => {}}
        onOpenSettings={() => {}}
      />
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    const label = screen.getByText("offline-srv");
    expect(label).toHaveStyle({ color: "rgb(128, 128, 128)" });
  });

  it("clicking checkbox calls onToggle with the correct server ID", () => {
    const onToggle = vi.fn();
    const servers = [connected("toggle-srv")];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={["toggle-srv"]}
        onToggle={onToggle}
        onOpenSettings={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("toggle-srv");
  });

  it("error string is rendered beneath server name when server.error is set", () => {
    const servers = [
      disconnectedServer("err-srv", { error: "Connection refused: ECONNREFUSED" }),
    ];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={[]}
        onToggle={() => {}}
        onOpenSettings={() => {}}
      />
    );

    expect(screen.getByText("Connection refused: ECONNREFUSED")).toBeInTheDocument();
  });

  it("no error text when server.error is not set", () => {
    const servers = [connected("ok-srv")];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={["ok-srv"]}
        onToggle={() => {}}
        onOpenSettings={() => {}}
      />
    );

    // Confirm server renders but no extra error text
    expect(screen.getByText("ok-srv")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  it("Settings link is present and calls onOpenSettings on click", () => {
    const onOpenSettings = vi.fn();
    render(
      <ServerSidebar
        servers={[]}
        enabledServers={[]}
        onToggle={() => {}}
        onOpenSettings={onOpenSettings}
      />
    );

    const settingsBtn = screen.getByRole("button", { name: "Settings" });
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("no connect/disconnect/reconnect buttons are rendered", () => {
    const servers = [
      connected("srv-a"),
      disconnectedServer("srv-b"),
      disconnectedServer("srv-c", { requiresOAuth: true }),
    ];
    render(
      <ServerSidebar
        servers={servers}
        enabledServers={["srv-a"]}
        onToggle={() => {}}
        onOpenSettings={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reconnect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });
});
