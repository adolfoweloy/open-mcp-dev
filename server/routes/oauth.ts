import { Router } from "express";
import {
  discoverOAuthProtectedResourceMetadata,
  discoverOAuthMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthTokens,
  OAuthClientInformationMixed,
  OAuthMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Config } from "../config.js";
import type { MCPClientManager, OAuthTokenSet } from "../lib/mcp-manager.js";

interface PendingSession {
  serverId: string;
  codeVerifier: string;
  clientInfo: OAuthClientInformationMixed;
  redirectUri: string;
  authorizationServerUrl: string;
}

export const pendingSessions = new Map<string, PendingSession>();
export const oauthTokens = new Map<string, OAuthTokens>();

export function getOAuthToken(serverId: string): OAuthTokens | undefined {
  return oauthTokens.get(serverId);
}

function generateState(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

/** Injectable auth dependencies (for testing) */
export interface OAuthDeps {
  discoverOAuthProtectedResourceMetadata: typeof discoverOAuthProtectedResourceMetadata;
  discoverOAuthMetadata: typeof discoverOAuthMetadata;
  registerClient: typeof registerClient;
  startAuthorization: typeof startAuthorization;
  exchangeAuthorization: typeof exchangeAuthorization;
}

const defaultDeps: OAuthDeps = {
  discoverOAuthProtectedResourceMetadata,
  discoverOAuthMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
};

export function createOAuthRouter(
  config: Config,
  mcpManager: MCPClientManager,
  deps: OAuthDeps = defaultDeps
) {
  const router = Router();

  router.get("/oauth/start", async (req, res) => {
    const serverId = req.query["server"] as string | undefined;

    if (!serverId) {
      res.status(400).json({ error: "Missing required query param: server" });
      return;
    }

    const serverConfig = config.mcp_servers[serverId];
    if (!serverConfig) {
      res
        .status(400)
        .json({ error: `Server "${serverId}" not found in config` });
      return;
    }

    if (serverConfig.type !== "http" || !serverConfig.oauth) {
      res
        .status(400)
        .json({ error: `Server "${serverId}" is not configured for OAuth` });
      return;
    }

    try {
      const serverUrl = serverConfig.url;

      // Discover OAuth metadata
      const resourceMetadata =
        await deps.discoverOAuthProtectedResourceMetadata(serverUrl);

      // Determine authorization server URL from resource metadata
      const authServerUrl =
        (resourceMetadata as { authorization_servers?: string[] })
          ?.authorization_servers?.[0] ?? serverUrl;

      const metadata = await deps.discoverOAuthMetadata(authServerUrl);

      // Build client info — use pre-configured client_id if available
      let clientInfo: OAuthClientInformationMixed;

      if (serverConfig.client_id) {
        clientInfo = {
          client_id: serverConfig.client_id,
          ...(serverConfig.client_secret
            ? { client_secret: serverConfig.client_secret }
            : {}),
        };
      } else {
        // Dynamic client registration
        const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/callback`;
        const registered = await deps.registerClient(authServerUrl, {
          metadata: (metadata as OAuthMetadata) ?? undefined,
          clientMetadata: {
            client_name: "MCP Chat",
            redirect_uris: [redirectUri],
            grant_types: ["authorization_code"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
        });
        clientInfo = registered;
      }

      const redirectUri = `${req.protocol}://${req.get("host")}/api/oauth/callback`;
      const state = generateState();

      const { authorizationUrl, codeVerifier } = await deps.startAuthorization(
        authServerUrl,
        {
          metadata: (metadata as OAuthMetadata) ?? undefined,
          clientInformation: clientInfo,
          redirectUrl: redirectUri,
          state,
        }
      );

      pendingSessions.set(state, {
        serverId,
        codeVerifier,
        clientInfo,
        redirectUri,
        authorizationServerUrl: authServerUrl,
      });

      res.redirect(authorizationUrl.toString());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

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
