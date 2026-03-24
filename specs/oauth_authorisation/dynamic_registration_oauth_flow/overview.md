# OAuth Dynamic Registration Flow — Overview

Implements RFC 7591 dynamic client registration plus OAuth2 Authorization Code + PKCE for MCP servers that require authentication. Our Express server self-registers as a public OAuth client at runtime, obtains tokens, and attaches them to MCP HTTP requests. Tokens and client credentials are in-memory only — lost on server restart.

## Key Design Decisions

- **Public client + PKCE only** — no `client_secret`; PKCE is the primary security control for the code exchange
- **Single auth flow per server** — `MCPClientManager` holds one auth-in-progress lock per server ID; concurrent 401s queue behind it rather than spawning duplicate flows
- **Banner instead of direct popup for auto-trigger** — 401-triggered flows emit an `auth_required` data stream event to the frontend, which shows a dismissible banner; the user clicks to open the popup, avoiding browser popup-blocker suppression
- **Server-side token exchange** — `/oauth/callback` validates state, exchanges the code, and stores the token; the callback page then `postMessage`s a completion signal to the opener for UI update only
- **Dynamic redirect URI** — `redirect_uri` is constructed from the Express server's actual listening port at runtime
- **Discovery order** — MCP spec discovery (parse `WWW-Authenticate` from initial request) first, then RFC 8414 (`/.well-known/oauth-authorization-server`); hard error if both fail
- **Refresh token** — access tokens are refreshed proactively; full re-auth if refresh fails or no refresh token exists

## Non-Goals

- OAuth token or client credential persistence across server restarts
- Confidential client registration (client_secret)
- Fallback to manual client_id entry if dynamic registration fails
- Registering with more than one authorization server per MCP server
- OAuth flows for STDIO MCP servers

## References

- Requirements: [requirements.md](requirements.md)
- Design: [design.md](design.md)
