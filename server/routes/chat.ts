import { Router } from "express";
import { streamText, convertToCoreMessages, pipeDataStreamToResponse } from "ai";
import type { Config } from "../config.js";
import { getSystemPrompt } from "../config.js";
import { createModel } from "../lib/models.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { ModelSelection } from "../../shared/types.js";

export function createChatRouter(
  config: Config,
  mcpManager: MCPClientManager,
  getOAuthToken?: (serverId: string) => { access_token?: string } | undefined
) {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { messages, model, selectedServers } = req.body as {
      messages: unknown[];
      model: ModelSelection;
      selectedServers: string[];
    };

    let llm: ReturnType<typeof createModel>;
    try {
      llm = createModel(model, config);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const systemPrompt = getSystemPrompt(model, config);
    const tools = await mcpManager.getToolsForAiSdk(selectedServers);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Vercel-AI-Data-Stream", "v1");

    const attempt = async () => {
      const result = streamText({
        model: llm,
        system: systemPrompt,
        messages: convertToCoreMessages(messages as Parameters<typeof convertToCoreMessages>[0]),
        tools,
        maxSteps: 20,
        onError: (err) => console.error("[chat]", err),
      });
      result.pipeDataStreamToResponse(res);
      return result;
    };

    try {
      await attempt();
    } catch (err) {
      // Surface the error inline if something went wrong before streaming started
      console.error("[chat] fatal error", err);
      if (!res.headersSent) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  });

  return router;
}
