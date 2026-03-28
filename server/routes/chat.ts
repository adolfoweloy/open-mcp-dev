import { randomUUID } from "crypto";
import { Router } from "express";
import { streamText, convertToCoreMessages, pipeDataStreamToResponse } from "ai";
import type { Config } from "../config.js";
import { getSystemPrompt } from "../config.js";
import { createModel } from "../lib/models.js";
import type { MCPClientManager } from "../lib/mcp-manager.js";
import type { ModelSelection, StreamDebugEvent } from "../../shared/types.js";

function serializePayload(data: unknown): string {
  if (data === undefined || data === null) return "";
  let raw: string;
  try {
    raw = JSON.stringify(data, null, 2) ?? "";
  } catch {
    return "";
  }
  if (raw.length > 10_240) return raw.slice(0, 10_240) + "\n[TRUNCATED]";
  return raw;
}

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

          const emitDebug = (debugEvent: Omit<StreamDebugEvent["event"], "id" | "timestamp">) => {
            try {
              const event: StreamDebugEvent = {
                type: "debug",
                event: {
                  id: randomUUID(),
                  timestamp: new Date().toISOString(),
                  ...debugEvent,
                },
              };
              emitEvent(event);
            } catch {
              // swallow serialisation errors
            }
          };

          const tools = await mcpManager.getToolsForAiSdk(selectedServers, emitEvent, disabledServers ?? []);

          const toolNames = Object.keys(tools);
          const messageCount = (messages as unknown[]).length;
          let stepCount = 1;
          let stepStartTime = Date.now();

          // Emit step-start for step 1 before streamText
          emitDebug({
            actor: "llm",
            type: "step-start",
            step: 1,
            summary: `Step 1: ${model.provider}/${model.id} — ${toolNames.length} tools, ${messageCount} messages`,
            payload: serializePayload({ model: model.id, step: 1, toolNames, messageCount }),
          });

          const result = streamText({
            model: llm,
            system: systemPrompt,
            messages: convertToCoreMessages(messages as Parameters<typeof convertToCoreMessages>[0]),
            tools,
            maxSteps: 20,
            onError: (err) => console.error("[chat]", err),
            onStepFinish: ({ toolCalls, finishReason, usage }) => {
              const durationMs = Date.now() - stepStartTime;
              const currentStep = stepCount;

              if (finishReason === "tool-calls" && toolCalls.length > 0) {
                emitDebug({
                  actor: "llm",
                  type: "tool-decision",
                  step: currentStep,
                  summary: `Tools chosen: ${toolCalls.map((tc) => tc.toolName).join(", ")}`,
                  payload: serializePayload(
                    toolCalls.map((tc) => ({ name: tc.toolName, args: tc.args }))
                  ),
                });
              }

              emitDebug({
                actor: "llm",
                type: "step-finish",
                step: currentStep,
                durationMs,
                summary: `Step ${currentStep} finish: ${finishReason} (${durationMs}ms)`,
                payload: serializePayload({ step: currentStep, finishReason, usage, durationMs }),
              });

              if (finishReason === "tool-calls") {
                stepCount++;
                stepStartTime = Date.now();
                emitDebug({
                  actor: "llm",
                  type: "step-start",
                  step: stepCount,
                  summary: `Step ${stepCount}: ${model.provider}/${model.id} — tool results included`,
                  payload: serializePayload({ model: model.id, step: stepCount }),
                });
              }
            },
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
