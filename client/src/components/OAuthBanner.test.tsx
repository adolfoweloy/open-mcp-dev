import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OAuthBanner } from "./OAuthBanner";

vi.mock("../lib/api", () => ({
  fetchOAuthAuthUrl: vi.fn(),
}));

import { fetchOAuthAuthUrl } from "../lib/api";
const mockFetchOAuthAuthUrl = vi.mocked(fetchOAuthAuthUrl);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset window.open mock
  vi.stubGlobal("open", vi.fn().mockReturnValue({ closed: false, close: vi.fn() }));
});

describe("OAuthBanner", () => {
  it("renders serverId in banner text", () => {
    render(<OAuthBanner serverId="my-server" onDismiss={() => {}} />);
    expect(
      screen.getByText(/Authorization required for server my-server/)
    ).toBeInTheDocument();
  });

  it("Authorize button calls fetchOAuthAuthUrl and opens a popup", async () => {
    mockFetchOAuthAuthUrl.mockResolvedValue({ authUrl: "https://auth.example.com/authorize" });

    render(<OAuthBanner serverId="my-server" onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize" }));

    await waitFor(() => {
      expect(mockFetchOAuthAuthUrl).toHaveBeenCalledWith("my-server");
      expect(window.open).toHaveBeenCalledWith(
        "https://auth.example.com/authorize",
        "_blank",
        "width=600,height=700"
      );
    });
  });

  it("dismiss button calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<OAuthBanner serverId="my-server" onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("postMessage with correct type and serverId from correct origin calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<OAuthBanner serverId="my-server" onDismiss={onDismiss} />);

    const origin = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const event = new MessageEvent("message", {
      origin,
      data: { type: "oauth_complete", serverId: "my-server" },
    });
    window.dispatchEvent(event);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("postMessage from wrong origin does NOT call onDismiss", () => {
    const onDismiss = vi.fn();
    render(<OAuthBanner serverId="my-server" onDismiss={onDismiss} />);

    const event = new MessageEvent("message", {
      origin: "http://evil.example.com",
      data: { type: "oauth_complete", serverId: "my-server" },
    });
    window.dispatchEvent(event);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("postMessage with wrong serverId does NOT call onDismiss", () => {
    const onDismiss = vi.fn();
    render(<OAuthBanner serverId="my-server" onDismiss={onDismiss} />);

    const origin = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const event = new MessageEvent("message", {
      origin,
      data: { type: "oauth_complete", serverId: "other-server" },
    });
    window.dispatchEvent(event);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("event listener is removed on unmount", () => {
    const onDismiss = vi.fn();
    const { unmount } = render(
      <OAuthBanner serverId="my-server" onDismiss={onDismiss} />
    );

    unmount();

    const origin = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const event = new MessageEvent("message", {
      origin,
      data: { type: "oauth_complete", serverId: "my-server" },
    });
    window.dispatchEvent(event);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
