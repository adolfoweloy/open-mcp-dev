import { useEffect, useRef } from "react";
import { fetchOAuthAuthUrl } from "../lib/api";

interface Props {
  serverId: string;
  onDismiss: () => void;
}

export function OAuthBanner({ serverId, onDismiss }: Props) {
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const expectedOrigin = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== expectedOrigin) {
        console.warn(
          "[OAuthBanner] Ignoring message from unexpected origin:",
          event.origin
        );
        return;
      }
      const data = event.data as { type?: string; serverId?: string };
      if (data?.type === "oauth_complete" && data.serverId === serverId) {
        onDismiss();
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [serverId, onDismiss]);

  async function handleAuthorize() {
    try {
      const { authUrl } = await fetchOAuthAuthUrl(serverId);
      const popup = window.open(authUrl, "_blank", "width=600,height=700");
      popupRef.current = popup;
    } catch (err) {
      console.error("[OAuthBanner] Failed to get auth URL", err);
    }
  }

  function handleDismiss() {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    onDismiss();
  }

  return (
    <div role="banner" aria-label="OAuth authorization required">
      <span>Authorization required for server {serverId}</span>
      <button onClick={() => void handleAuthorize()}>Authorize</button>
      <button onClick={handleDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
