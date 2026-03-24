import { Router } from "express";
import type { MCPClientManager } from "../lib/mcp-manager.js";

export function createMcpProxyRouter(mcpManager: MCPClientManager) {
  const router = Router();

  router.get("/mcp/resource/:serverId", async (req, res) => {
    const { serverId } = req.params;
    const { uri } = req.query;

    if (!uri || typeof uri !== "string") {
      res.status(400).json({ error: "Missing required query param: uri" });
      return;
    }

    const client = mcpManager.getClient(serverId);
    if (!client) {
      res.status(404).json({ error: `Server "${serverId}" is not connected` });
      return;
    }

    try {
      const result = await client.readResource({ uri });

      const htmlContent = result.contents.find((c) => {
        const mime = c.mimeType ?? "";
        return mime.startsWith("text/html");
      });

      if (!htmlContent) {
        res.status(415).json({
          error: "Resource is not an HTML resource (text/html)",
        });
        return;
      }

      const text = "text" in htmlContent ? htmlContent.text : null;
      if (typeof text !== "string") {
        res.status(415).json({ error: "Resource content is not text" });
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(text);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const status401 =
        message.includes("401") || message.toLowerCase().includes("unauthorized");
      res.status(status401 ? 401 : 500).json({ error: message });
    }
  });

  return router;
}
