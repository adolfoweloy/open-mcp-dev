import { createOpenAI } from "@ai-sdk/openai";
import type { Config } from "../config.js";
import type { ModelSelection } from "../../shared/types.js";

export function createModel(selection: ModelSelection, config: Config) {
  if (selection.provider === "openai") {
    if (!config.llm.openai) {
      throw new Error(
        "OpenAI provider is not configured. Add llm.openai to config.yaml."
      );
    }
    return createOpenAI({ apiKey: config.llm.openai.api_key })(selection.id);
  }

  if (selection.provider === "ollama") {
    // Use Ollama's OpenAI-compatible endpoint (/v1) via @ai-sdk/openai.
    // This correctly handles tool calling for models like llama3.1, whereas
    // the native Ollama provider silently drops tool-call tokens.
    const rawBase = config.llm.ollama?.base_url ?? "http://localhost:11434";
    const base = rawBase.replace(/\/+$/, "");
    const baseURL = base.endsWith("/v1") ? base : `${base}/v1`;
    return createOpenAI({ baseURL, apiKey: "ollama" })(selection.id);
  }

  throw new Error(
    `Unknown provider "${(selection as ModelSelection).provider}". Supported: openai, ollama.`
  );
}
