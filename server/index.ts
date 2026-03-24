import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "./config.js";
import { MCPClientManager } from "./lib/mcp-manager.js";
import { createChatRouter } from "./routes/chat.js";
import { createModelsRouter } from "./routes/models.js";
import { createMcpRouter } from "./routes/mcp.js";
import { createMcpProxyRouter } from "./routes/mcp-proxy.js";
import { createOAuthRouter, getOAuthToken } from "./routes/oauth.js";

// Load config — exit with error if missing or invalid
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  console.error("[startup] Failed to load config.yaml:", (err as Error).message);
  process.exit(1);
}

// Instantiate singleton MCPClientManager
export const mcpManager = new MCPClientManager();

// Auto-connect non-OAuth servers at startup
for (const [id, serverConfig] of Object.entries(config.mcp_servers)) {
  if (serverConfig.type === "http" && serverConfig.oauth) {
    console.log(`[startup] Skipping OAuth server "${id}" (will connect after auth)`);
    continue;
  }
  mcpManager
    .connectToServer(id, serverConfig)
    .then(() => console.log(`[startup] Connected to MCP server "${id}"`))
    .catch((err: Error) =>
      console.warn(`[startup] Could not connect to MCP server "${id}": ${err.message}`)
    );
}

const app = express();

app.use(express.json());

// Mount API routes
app.use("/api", createChatRouter(config, mcpManager, getOAuthToken));
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

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

export default app;
