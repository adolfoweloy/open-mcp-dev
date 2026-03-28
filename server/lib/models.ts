import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import type { Config } from "../config.js";
import type { ModelSelection } from "../../shared/types.js";
import { normaliseOllamaBaseUrl } from "./ollama.js";

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
    const baseURL = normaliseOllamaBaseUrl(
      config.llm.ollama?.base_url ?? "http://localhost:11434"
    );
    return createOllama({ baseURL })(selection.id);
  }

  throw new Error(
    `Unknown provider "${(selection as ModelSelection).provider}". Supported: openai, ollama.`
  );
}
