import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { load, dump } from "js-yaml";
import type { Config, McpServerConfig } from "../config.js";

const DEFAULT_CONFIG_PATH = resolve(import.meta.dirname, "../..", "config.yaml");

export class ConfigWriter {
  private queue: Promise<void> = Promise.resolve();
  private configPath: string;

  constructor(configPath = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
  }

  addServer(id: string, config: McpServerConfig): Promise<void> {
    return this.enqueue(async () => {
      const cfg = this.readYaml();
      cfg.mcp_servers[id] = config;
      this.writeYaml(cfg);
    });
  }

  updateServer(oldId: string, newId: string, config: McpServerConfig): Promise<void> {
    return this.enqueue(async () => {
      const cfg = this.readYaml();
      if (oldId !== newId) {
        delete cfg.mcp_servers[oldId];
      }
      cfg.mcp_servers[newId] = config;
      this.writeYaml(cfg);
    });
  }

  removeServer(id: string): Promise<void> {
    return this.enqueue(async () => {
      const cfg = this.readYaml();
      delete cfg.mcp_servers[id];
      this.writeYaml(cfg);
    });
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(() => op());
    return this.queue;
  }

  readYaml(): Config {
    const raw = readFileSync(this.configPath, "utf-8");
    const parsed = load(raw) as Record<string, unknown>;
    const llm = (parsed["llm"] ?? {}) as Record<string, unknown>;
    const mcpServers = (parsed["mcp_servers"] ?? {}) as Record<string, McpServerConfig>;
    return {
      llm: {
        openai: llm["openai"] as Config["llm"]["openai"],
        ollama: llm["ollama"] as Config["llm"]["ollama"],
      },
      mcp_servers: mcpServers,
    };
  }

  writeYaml(config: Config): void {
    const raw = dump(config, { lineWidth: -1 });
    writeFileSync(this.configPath, raw, "utf-8");
  }
}
