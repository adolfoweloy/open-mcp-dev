import { readFileSync } from "fs";
import { load } from "js-yaml";
import type { ModelSelection } from "../shared/types.js";

export type McpServerConfig =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
      timeout?: number;
    }
  | {
      type: "http";
      url: string;
      oauth?: boolean;
      client_id?: string;
      client_secret?: string;
      access_token?: string;
      refresh_token?: string;
      prefer_sse?: boolean;
      timeout?: number;
    };

export interface Config {
  llm: {
    openai?: {
      api_key: string;
      default_model?: string;
      system_prompt?: string;
    };
    ollama?: {
      base_url?: string;
      system_prompt?: string;
    };
  };
  mcp_servers: Record<string, McpServerConfig>;
}

export function loadConfig(path = "config.yaml"): Config {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read config file "${path}": ${(err as NodeJS.ErrnoException).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = load(raw);
  } catch (err) {
    throw new Error(`Invalid YAML in "${path}": ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Config file "${path}" must be a YAML object`);
  }

  const config = parsed as Record<string, unknown>;

  const llm = (config["llm"] ?? {}) as Record<string, unknown>;
  const mcpServers = (config["mcp_servers"] ?? {}) as Record<
    string,
    McpServerConfig
  >;

  return {
    llm: {
      openai: llm["openai"] as Config["llm"]["openai"],
      ollama: llm["ollama"] as Config["llm"]["ollama"],
    },
    mcp_servers: mcpServers,
  };
}

export function getSystemPrompt(
  model: ModelSelection,
  config: Config
): string | undefined {
  if (model.provider === "openai") {
    return config.llm.openai?.system_prompt;
  }
  if (model.provider === "ollama") {
    return config.llm.ollama?.system_prompt;
  }
  return undefined;
}
