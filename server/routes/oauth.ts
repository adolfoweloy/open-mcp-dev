import { Router } from "express";
import type { Config } from "../config.js";
import type { MCPClientManager, OAuthTokenSet } from "../lib/mcp-manager.js";

export function createOAuthRouter(
  config: Config,
  mcpManager: MCPClientManager
) {
  const router = Router();

  router.get("/oauth/callback", async (req, res) => {
    const { code, state } = req.query as { code?: string; state?: string };

    if (!state) {
      res.status(400).json({ error: "Invalid or missing OAuth state" });
      return;
    }

    const pendingState = mcpManager.getPendingState(state);
    if (!pendingState) {
      res.status(400).json({ error: "Invalid or missing OAuth state" });
      return;
    }

    if (pendingState.expiresAt < Date.now()) {
      mcpManager.deletePendingState(state);
      res.status(400).json({ error: "OAuth state expired" });
      return;
    }

    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    const { serverId, codeVerifier } = pendingState;
    const clientConfig = mcpManager.getOAuthClientConfig(serverId);

    const host = req.get("host") || "localhost:3000";
    const redirectUri = `http://${host}/oauth/callback`;
    const port = host.includes(":") ? host.split(":")[1] : "3000";

    console.info(`[oauth] Callback received for server "${serverId}"`);

    try {
      const tokenResponse = await fetch(clientConfig!.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientConfig!.clientId,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const err = new Error(
          `Token exchange failed: HTTP ${tokenResponse.status}`
        );
        await mcpManager.failOAuthFlow(serverId, err);
        mcpManager.deletePendingState(state);
        res.status(502).json({ error: err.message });
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const tokenSet: OAuthTokenSet = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_in
          ? Date.now() + tokenData.expires_in * 1000
          : undefined,
      };

      await mcpManager.completeOAuthFlow(serverId, tokenSet);
      mcpManager.deletePendingState(state);

      console.info(`[oauth] Token exchange success for server "${serverId}"`);

      res.type("text/html").send(
        `<script>window.opener?.postMessage({type:"oauth_complete",serverId:"${serverId}"},"http://localhost:${port}");window.close();</script>`
      );
    } catch (err) {
      const error = err as Error;
      await mcpManager.failOAuthFlow(serverId, error);
      mcpManager.deletePendingState(state);
      res.status(502).json({ error: error.message });
    }
  });

  return router;
}
