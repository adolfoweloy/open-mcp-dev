import { Router } from "express";
import type { Config } from "../config.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";

export function createMcpRouter(config: Config, mcpManager: MCPClientManager) {
  const router = Router();

  router.get("/mcp/servers", (_req, res) => {
    const statuses = mcpManager.getServerStatuses(config.mcp_servers);
    res.json(statuses);
  });

  router.post("/mcp/connect", async (req, res) => {
    const { serverId } = req.body as { serverId: string };
    const serverConfig = config.mcp_servers[serverId];

    if (!serverConfig) {
      res.status(404).json({ error: `Server "${serverId}" not found in config` });
      return;
    }

    try {
      await mcpManager.connectToServer(serverId, serverConfig);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete("/mcp/disconnect", async (req, res) => {
    const { serverId } = req.body as { serverId: string };

    if (!config.mcp_servers[serverId]) {
      res.status(404).json({ error: `Server "${serverId}" not found in config` });
      return;
    }

    await mcpManager.disconnectServer(serverId);
    res.json({ ok: true });
  });

  return router;
}
