import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ServerFormModal } from "./ServerFormModal";
import type { ScrubbedMcpServerConfig } from "../../../shared/types";

vi.mock("../lib/api", () => ({
  addServer: vi.fn(),
  updateServer: vi.fn(),
}));

import { addServer, updateServer } from "../lib/api";
const mockAddServer = vi.mocked(addServer);
const mockUpdateServer = vi.mocked(updateServer);

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ServerFormModal — add mode", () => {
  it("renders stdio-specific fields when stdio is selected", () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    expect(screen.getByLabelText("Command")).toBeInTheDocument();
    expect(screen.getByLabelText("Args")).toBeInTheDocument();
    expect(screen.queryByLabelText("URL")).toBeNull();
  });

  it("renders http-specific fields when http is selected", () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    // switch to http
    fireEvent.click(screen.getByRole("radio", { name: "http" }));
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.queryByLabelText("Command")).toBeNull();
  });

  it("shows OAuth sub-fields when OAuth enabled is checked", () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.click(screen.getByRole("radio", { name: "http" }));
    fireEvent.click(screen.getByLabelText("OAuth enabled"));
    expect(screen.getByLabelText("Client ID")).toBeInTheDocument();
    expect(screen.getByLabelText("Client Secret")).toBeInTheDocument();
    expect(screen.getByLabelText("Access Token")).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh Token")).toBeInTheDocument();
  });

  it("validates name is required for stdio", async () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));
    await waitFor(() => expect(screen.getByText("Name is required")).toBeInTheDocument());
  });

  it("validates command is required for stdio", async () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "my-server" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));
    await waitFor(() => expect(screen.getByText("Command is required")).toBeInTheDocument());
  });

  it("validates url is required for http", async () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.click(screen.getByRole("radio", { name: "http" }));
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "my-server" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));
    await waitFor(() => expect(screen.getByText("URL is required")).toBeInTheDocument());
  });

  it("validates client_id is required when oauth enabled", async () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.click(screen.getByRole("radio", { name: "http" }));
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "my-server" } });
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "http://example.com" } });
    fireEvent.click(screen.getByLabelText("OAuth enabled"));
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));
    await waitFor(() => expect(screen.getByText("Client ID is required")).toBeInTheDocument());
  });

  it("splits args string into array on submit", async () => {
    mockAddServer.mockResolvedValue({ id: "my-server", status: { id: "my-server", connected: false, requiresOAuth: false, type: "stdio" } });
    const onSaved = vi.fn();

    render(<ServerFormModal mode="add" onClose={noop} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "my-server" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.change(screen.getByLabelText("Args"), { target: { value: "-y @mcp/server path/to/dir" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));

    await waitFor(() => expect(mockAddServer).toHaveBeenCalled());
    const [, config] = mockAddServer.mock.calls[0];
    expect(config.type).toBe("stdio");
    if (config.type === "stdio") {
      expect(config.args).toEqual(["-y", "@mcp/server", "path/to/dir"]);
    }
    expect(onSaved).toHaveBeenCalled();
  });

  it("env rows can be added and removed", () => {
    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    // initially one row
    expect(screen.getAllByLabelText(/Env key/)).toHaveLength(1);

    // add a row
    fireEvent.click(screen.getByRole("button", { name: "+ Add variable" }));
    expect(screen.getAllByLabelText(/Env key/)).toHaveLength(2);

    // remove first row
    fireEvent.click(screen.getAllByLabelText(/Remove env row/)[0]);
    expect(screen.getAllByLabelText(/Env key/)).toHaveLength(1);
  });

  it("env rows are serialised as Record on submit", async () => {
    mockAddServer.mockResolvedValue({ id: "s", status: { id: "s", connected: false, requiresOAuth: false, type: "stdio" } });

    render(<ServerFormModal mode="add" onClose={noop} onSaved={noop} />);
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "s" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "node" } });
    fireEvent.change(screen.getByLabelText("Env key 1"), { target: { value: "FOO" } });
    fireEvent.change(screen.getByLabelText("Env value 1"), { target: { value: "bar" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));

    await waitFor(() => expect(mockAddServer).toHaveBeenCalled());
    const [, config] = mockAddServer.mock.calls[0];
    if (config.type === "stdio") {
      expect(config.env).toEqual({ FOO: "bar" });
    }
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<ServerFormModal mode="add" onClose={onClose} onSaved={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on clicking outside modal overlay", () => {
    const onClose = vi.fn();
    const { baseElement } = render(<ServerFormModal mode="add" onClose={onClose} onSaved={noop} />);
    // The overlay div is the first fixed div in the portal
    const overlay = baseElement.querySelector("[role='dialog']")?.parentElement;
    if (overlay) fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ServerFormModal — edit mode", () => {
  const stdioConfig: ScrubbedMcpServerConfig = {
    type: "stdio",
    command: "npx",
    args: ["-y", "some-mcp"],
    env: { API_KEY: "val" },
  };

  const httpConfigWithOAuth: ScrubbedMcpServerConfig = {
    type: "http",
    url: "https://example.com/mcp",
    oauth: {
      client_id: "cid",
      has_client_secret: true,
      has_access_token: true,
      has_refresh_token: false,
    },
  };

  it("type selector is disabled in edit mode", () => {
    render(
      <ServerFormModal
        mode="edit"
        serverId="my-stdio"
        initialConfig={stdioConfig}
        onClose={noop}
        onSaved={noop}
      />
    );
    const stdioRadio = screen.getByRole("radio", { name: "stdio" });
    const httpRadio = screen.getByRole("radio", { name: "http" });
    expect(stdioRadio).toBeDisabled();
    expect(httpRadio).toBeDisabled();
  });

  it("pre-populates stdio fields from initialConfig", () => {
    render(
      <ServerFormModal
        mode="edit"
        serverId="my-stdio"
        initialConfig={stdioConfig}
        onClose={noop}
        onSaved={noop}
      />
    );
    expect(screen.getByLabelText("Server name")).toHaveValue("my-stdio");
    expect(screen.getByLabelText("Command")).toHaveValue("npx");
    expect(screen.getByLabelText("Args")).toHaveValue("-y some-mcp");
    expect(screen.getByLabelText("Env key 1")).toHaveValue("API_KEY");
    expect(screen.getByLabelText("Env value 1")).toHaveValue("val");
  });

  it("sensitive fields show (saved) placeholder when has_* is true", () => {
    render(
      <ServerFormModal
        mode="edit"
        serverId="my-http"
        initialConfig={httpConfigWithOAuth}
        onClose={noop}
        onSaved={noop}
      />
    );
    const clientSecretInput = screen.getByLabelText("Client Secret") as HTMLInputElement;
    const accessTokenInput = screen.getByLabelText("Access Token") as HTMLInputElement;
    const refreshTokenInput = screen.getByLabelText("Refresh Token") as HTMLInputElement;

    expect(clientSecretInput.placeholder).toBe("(saved)");
    expect(accessTokenInput.placeholder).toBe("(saved)");
    // has_refresh_token is false so no (saved) placeholder
    expect(refreshTokenInput.placeholder).toBe("");
  });

  it("submitting with unchanged sensitive placeholder sends null", async () => {
    mockUpdateServer.mockResolvedValue({ id: "my-http", status: { id: "my-http", connected: false, requiresOAuth: false, type: "http" } });
    const onSaved = vi.fn();

    render(
      <ServerFormModal
        mode="edit"
        serverId="my-http"
        initialConfig={httpConfigWithOAuth}
        onClose={noop}
        onSaved={onSaved}
      />
    );

    // Submit without touching sensitive fields
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateServer).toHaveBeenCalled());
    const [, body] = mockUpdateServer.mock.calls[0];
    const config = body.config;
    // client_secret and access_token should be omitted (null sentinel = not included)
    if (config.type === "http") {
      expect("client_secret" in config).toBe(false);
      expect("access_token" in config).toBe(false);
    }
    expect(onSaved).toHaveBeenCalled();
  });

  it("clearing a sensitive field sends empty string", async () => {
    mockUpdateServer.mockResolvedValue({ id: "my-http", status: { id: "my-http", connected: false, requiresOAuth: false, type: "http" } });

    render(
      <ServerFormModal
        mode="edit"
        serverId="my-http"
        initialConfig={httpConfigWithOAuth}
        onClose={noop}
        onSaved={noop}
      />
    );

    // Focus the client_secret field (clears null → ""), then clear it
    const clientSecretInput = screen.getByLabelText("Client Secret");
    fireEvent.focus(clientSecretInput);
    // value should now be "" (focused clears null)
    // keep it as "" and submit
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateServer).toHaveBeenCalled());
    const [, body] = mockUpdateServer.mock.calls[0];
    const config = body.config;
    if (config.type === "http") {
      expect(config.client_secret).toBe("");
    }
  });

  it("sends newId when name changes", async () => {
    mockUpdateServer.mockResolvedValue({ id: "renamed", status: { id: "renamed", connected: false, requiresOAuth: false, type: "stdio" } });

    render(
      <ServerFormModal
        mode="edit"
        serverId="my-stdio"
        initialConfig={stdioConfig}
        onClose={noop}
        onSaved={noop}
      />
    );

    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateServer).toHaveBeenCalled());
    const [id, body] = mockUpdateServer.mock.calls[0];
    expect(id).toBe("my-stdio");
    expect(body.newId).toBe("renamed");
  });

  it("does not send newId when name is unchanged", async () => {
    mockUpdateServer.mockResolvedValue({ id: "my-stdio", status: { id: "my-stdio", connected: false, requiresOAuth: false, type: "stdio" } });

    render(
      <ServerFormModal
        mode="edit"
        serverId="my-stdio"
        initialConfig={stdioConfig}
        onClose={noop}
        onSaved={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateServer).toHaveBeenCalled());
    const [, body] = mockUpdateServer.mock.calls[0];
    expect(body.newId).toBeUndefined();
  });

  it("shows submit error when API call fails", async () => {
    mockUpdateServer.mockRejectedValue(new Error("HTTP 400: Server not found"));

    render(
      <ServerFormModal
        mode="edit"
        serverId="my-stdio"
        initialConfig={stdioConfig}
        onClose={noop}
        onSaved={noop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("HTTP 400: Server not found")).toBeInTheDocument()
    );
  });
});
