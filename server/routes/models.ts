import { Router } from "express";
import type { Config } from "../config.js";
import { listOllamaModels } from "../lib/ollama.js";
import type { ModelInfo } from "../../shared/types.js";

const OPENAI_MODELS: ModelInfo[] = [
  { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { provider: "openai", id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { provider: "openai", id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

export function createModelsRouter(config: Config) {
  const router = Router();

  router.get("/models", async (_req, res) => {
    const openaiModels: ModelInfo[] = config.llm?.openai ? [...OPENAI_MODELS] : [];

    let ollamaModels: ModelInfo[] = [];
    if (config.llm?.ollama) {
      const baseUrl = config.llm.ollama.base_url ?? "http://localhost:11434";
      ollamaModels = await listOllamaModels(baseUrl);
    }

    res.json([...openaiModels, ...ollamaModels]);
  });

  return router;
}
