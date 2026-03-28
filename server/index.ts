import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig, type Config } from "./config.js";
import { MCPClientManager } from "./lib/mcp-manager.js";
import { createChatRouter } from "./routes/chat.js";
import { createModelsRouter } from "./routes/models.js";
import { createMcpRouter } from "./routes/mcp.js";
import { createMcpProxyRouter } from "./routes/mcp-proxy.js";
import { createOAuthRouter } from "./routes/oauth.js";

/**
 * Wire all API routes onto an Express application.
 * Exported so tests can build the app without listening on a port.
 */
export function createApp(config: Config, mcpManager: MCPClientManager) {
  const app = express();
  app.use(express.json());

  app.use("/api", createChatRouter(config, mcpManager));
  app.use("/api", createModelsRouter(config));
  app.use("/api", createMcpRouter(config, mcpManager));
  app.use("/api", createMcpProxyRouter(mcpManager));
  app.use("/api", createOAuthRouter(config, mcpManager));

  // In production, serve the built client
  if (process.env.NODE_ENV === "production") {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.join(__dirname, "..", "client", "dist");
    app.use(express.static(clientDist));
    // Fallback to index.html for client-side routing
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}

/**
 * Auto-connect all servers that don't require OAuth.
 * Exported so tests can invoke startup logic with custom managers.
 */
export async function autoConnectServers(
  config: Config,
  mcpManager: MCPClientManager
): Promise<void> {
  const tasks = Object.entries(config.mcp_servers).map(
    async ([id, serverConfig]) => {
      if (serverConfig.type === "http" && serverConfig.oauth) {
        console.log(
          `[startup] Skipping OAuth server "${id}" (will connect after auth)`
        );
        // Register config even if we skip connecting
        mcpManager.getServerConfigs().set(id, serverConfig);
        return;
      }
      try {
        await mcpManager.addServer(id, serverConfig);
        console.log(`[startup] Connected to MCP server "${id}"`);
      } catch (err) {
        console.warn(
          `[startup] Could not connect to MCP server "${id}": ${
            (err as Error).message
          }`
        );
      }
    }
  );
  await Promise.all(tasks);
}

// ── Top-level startup (only runs when executed directly) ─────────────────────

// Guard so that importing this module in tests does not trigger startup
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop() ?? ""
  );

export let mcpManager: MCPClientManager | undefined;

if (isMain) {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(
      "[startup] Failed to load config.yaml:",
      (err as Error).message
    );
    process.exit(1);
  }

  mcpManager = new MCPClientManager();

  // Fire-and-forget auto-connect; failures are logged, not fatal
  autoConnectServers(config, mcpManager);

  const app = createApp(config, mcpManager);

  const PORT = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });
}
