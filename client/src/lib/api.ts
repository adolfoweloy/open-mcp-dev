import type { ModelInfo, McpServerStatus } from "./types";

async function checkResponse(res: Response): Promise<Response> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch("/api/models");
  await checkResponse(res);
  return res.json() as Promise<ModelInfo[]>;
}

export async function fetchServers(): Promise<McpServerStatus[]> {
  const res = await fetch("/api/mcp/servers");
  await checkResponse(res);
  return res.json() as Promise<McpServerStatus[]>;
}

export async function connectServer(serverId: string): Promise<void> {
  const res = await fetch("/api/mcp/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId }),
  });
  await checkResponse(res);
}

export async function disconnectServer(serverId: string): Promise<void> {
  const res = await fetch("/api/mcp/disconnect", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId }),
  });
  await checkResponse(res);
}
