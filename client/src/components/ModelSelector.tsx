import { useEffect, useState } from "react";
import { fetchModels } from "../lib/api";
import type { ModelInfo, ModelSelection } from "../lib/types";

interface Props {
  value: ModelSelection | null;
  onSelect: (model: ModelSelection) => void;
}

export function ModelSelector({ value, onSelect }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    fetchModels()
      .then((list) => {
        setModels(list);
        if (list.length > 0) {
          onSelect({ provider: list[0].provider, id: list[0].id });
        }
      })
      .catch((err: unknown) => {
        console.error("[ModelSelector] Failed to fetch models", err);
      });
    // onSelect is intentionally excluded — we only want to run this on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to first model when models list changes
  useEffect(() => {
    if (models.length > 0) {
      onSelect({ provider: models[0].provider, id: models[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const openaiModels = models.filter((m) => m.provider === "openai");
  const ollamaModels = models.filter((m) => m.provider === "ollama");

  const selectedValue = value ? `${value.provider}:${value.id}` : "";

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const [provider, ...rest] = e.target.value.split(":");
    const id = rest.join(":");
    onSelect({ provider: provider as ModelSelection["provider"], id });
  }

  return (
    <select value={selectedValue} onChange={handleChange}>
      {openaiModels.length > 0 && (
        <optgroup label="OpenAI">
          {openaiModels.map((m) => (
            <option key={`openai:${m.id}`} value={`openai:${m.id}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      )}
      {ollamaModels.length > 0 && (
        <optgroup label="Ollama">
          {ollamaModels.map((m) => (
            <option key={`ollama:${m.id}`} value={`ollama:${m.id}`}>
              {m.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
