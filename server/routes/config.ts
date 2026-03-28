import { Router } from "express";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import { ConfigWriter } from "../lib/config-writer.js";
import type { McpServerConfig } from "../config.js";
import type {
  ScrubbedMcpServerConfig,
  ServerConfigsResponse,
  AddServerRequest,
  UpdateServerRequest,
} from "../../shared/types.js";

function scrubConfig(config: McpServerConfig): ScrubbedMcpServerConfig {
  if (config.type === "stdio") {
    const scrubbed: ScrubbedMcpServerConfig = {
      type: "stdio",
      command: config.command,
    };
    if (config.args !== undefined) scrubbed.args = config.args;
    if (config.env !== undefined) scrubbed.env = config.env;
    if (config.timeout !== undefined) scrubbed.timeout = config.timeout;
    return scrubbed;
  } else {
    const scrubbed: ScrubbedMcpServerConfig = {
      type: "http",
      url: config.url,
    };
    if (config.timeout !== undefined) scrubbed.timeout = config.timeout;
    if (config.prefer_sse !== undefined) scrubbed.prefer_sse = config.prefer_sse;
    if (config.oauth || config.client_id) {
      scrubbed.oauth = {
        client_id: config.client_id ?? "",
        has_client_secret: Boolean(config.client_secret),
        has_access_token: Boolean(config.access_token),
        has_refresh_token: Boolean(config.refresh_token),
      };
    }
    return scrubbed;
  }
}

function validateConfig(config: unknown): string | null {
  if (!config || typeof config !== "object") {
    return "config is required";
  }
  const cfg = config as Record<string, unknown>;
  if (cfg["type"] !== "stdio" && cfg["type"] !== "http") {
    return "config.type must be 'stdio' or 'http'";
  }
  if (cfg["type"] === "stdio") {
    if (!cfg["command"] || typeof cfg["command"] !== "string") {
      return "config.command is required for stdio servers";
    }
  } else {
    if (!cfg["url"] || typeof cfg["url"] !== "string") {
      return "config.url is required for http servers";
    }
  }
  return null;
}

export function createConfigRouter(
  mcpManager: MCPClientManager,
  configWriter: ConfigWriter
) {
  const router = Router();

  // GET /api/config/servers — list all servers with sensitive fields scrubbed
  router.get("/config/servers", (_req, res) => {
    const configs = mcpManager.getServerConfigs();
    const response: ServerConfigsResponse = {};
    for (const [id, cfg] of configs) {
      response[id] = scrubConfig(cfg);
    }
    res.json(response);
  });

  // POST /api/config/servers — add a new server
  router.post("/config/servers", async (req, res) => {
    const body = req.body as AddServerRequest;

    if (!body.id || typeof body.id !== "string") {
      res.status(422).json({ error: "Validation error: id is required" });
      return;
    }

    const validationError = validateConfig(body.config);
    if (validationError) {
      res.status(422).json({ error: `Validation error: ${validationError}` });
      return;
    }

    if (mcpManager.getServerConfigs().has(body.id)) {
      res.status(400).json({ error: "Server ID already exists" });
      return;
    }

    try {
      await configWriter.addServer(body.id, body.config);
      await mcpManager.addServer(body.id, body.config);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const statuses = mcpManager.getServerStatuses();
    const status = statuses.find((s) => s.id === body.id);
    res.status(201).json({ id: body.id, status });
  });

  // PUT /api/config/servers/:id — update (and optionally rename) a server
  router.put("/config/servers/:id", async (req, res) => {
    const { id } = req.params;
    const body = req.body as UpdateServerRequest;

    if (!mcpManager.getServerConfigs().has(id)) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const newId = body.newId ?? id;

    if (newId !== id && mcpManager.getServerConfigs().has(newId)) {
      res.status(400).json({ error: "New server ID already exists" });
      return;
    }

    // Merge null sentinel fields with existing sensitive values
    const existingConfig = mcpManager.getServerConfigs().get(id)!;
    let mergedConfig: McpServerConfig = body.config;

    if (body.config.type === "http" && existingConfig.type === "http") {
      const merged = { ...body.config } as Extract<McpServerConfig, { type: "http" }>;
      const existing = existingConfig as Extract<McpServerConfig, { type: "http" }>;
      if ((body.config.client_secret as string | null) === null) {
        merged.client_secret = existing.client_secret;
      }
      if ((body.config.access_token as string | null) === null) {
        merged.access_token = existing.access_token;
      }
      if ((body.config.refresh_token as string | null) === null) {
        merged.refresh_token = existing.refresh_token;
      }
      mergedConfig = merged;
    }

    const validationError = validateConfig(mergedConfig);
    if (validationError) {
      res.status(422).json({ error: `Validation error: ${validationError}` });
      return;
    }

    try {
      await configWriter.updateServer(id, newId, mergedConfig);
      await mcpManager.updateServer(id, newId, mergedConfig);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const statuses = mcpManager.getServerStatuses();
    const status = statuses.find((s) => s.id === newId);
    res.status(200).json({ id: newId, status });
  });

  // DELETE /api/config/servers/:id — remove a server
  router.delete("/config/servers/:id", async (req, res) => {
    const { id } = req.params;

    if (!mcpManager.getServerConfigs().has(id)) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    try {
      await configWriter.removeServer(id);
      await mcpManager.removeServer(id);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    res.status(204).send();
  });

  return router;
}
