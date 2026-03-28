import { Router } from "express";
import { streamText, convertToCoreMessages, pipeDataStreamToResponse } from "ai";
import type { Config } from "../config.js";
import { getSystemPrompt } from "../config.js";
import { createModel } from "../lib/models.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { ModelSelection } from "../../shared/types.js";

export function createChatRouter(
  config: Config,
  mcpManager: MCPClientManager
) {
  const router = Router();

  router.post("/chat", async (req, res) => {
    const { messages, model, selectedServers, disabledServers } = req.body as {
      messages: unknown[];
      model: ModelSelection;
      selectedServers: string[];
      disabledServers?: string[];
    };

    let llm: ReturnType<typeof createModel>;
    try {
      llm = createModel(model, config);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
      return;
    }

    const systemPrompt = getSystemPrompt(model, config);

    try {
      pipeDataStreamToResponse(res, {
        execute: async (dataStreamWriter) => {
          const emitEvent = (event: object) => dataStreamWriter.writeData(event as Parameters<typeof dataStreamWriter.writeData>[0]);
          const tools = await mcpManager.getToolsForAiSdk(selectedServers, emitEvent, disabledServers ?? []);

          const result = streamText({
            model: llm,
            system: systemPrompt,
            messages: convertToCoreMessages(messages as Parameters<typeof convertToCoreMessages>[0]),
            tools,
            maxSteps: 20,
            onError: (err) => console.error("[chat]", err),
          });
          result.mergeIntoDataStream(dataStreamWriter);
        },
        onError: (err) => {
          console.error("[chat] fatal error", err);
          return (err as Error).message;
        },
      });
    } catch (err) {
      console.error("[chat] fatal error", err);
      if (!res.headersSent) {
        res.status(500).json({ error: (err as Error).message });
      }
    }
  });

  return router;
}
