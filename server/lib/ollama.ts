import type { ModelInfo } from "../../shared/types.js";

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

export function normaliseOllamaBaseUrl(raw: string): string {
  const stripped = raw.replace(/\/+$/, "");
  return stripped.endsWith("/api") ? stripped : `${stripped}/api`;
}

export async function listOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
  const url = `${normaliseOllamaBaseUrl(baseUrl)}/tags`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      console.warn(
        `[ollama] Failed to fetch models from ${url}: HTTP ${response.status}`
      );
      return [];
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return (data.models ?? []).map((m) => ({
      provider: "ollama" as const,
      id: m.name,
      label: m.name,
    }));
  } catch (err) {
    console.warn(`[ollama] Failed to fetch models from ${url}:`, err);
    return [];
  }
}
