import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ModelSelector } from "./ModelSelector";
import type { ModelInfo } from "../lib/types";

// Mock the api module
vi.mock("../lib/api", () => ({
  fetchModels: vi.fn(),
}));

import { fetchModels } from "../lib/api";
const mockFetchModels = vi.mocked(fetchModels);

const openaiModels: ModelInfo[] = [
  { provider: "openai", id: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o Mini" },
];

const ollamaModels: ModelInfo[] = [
  { provider: "ollama", id: "llama3", label: "llama3" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModelSelector", () => {
  it("renders options from fetched model list", async () => {
    mockFetchModels.mockResolvedValue([...openaiModels, ...ollamaModels]);

    render(<ModelSelector value={null} onSelect={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("GPT-4o")).toBeInTheDocument();
      expect(screen.getByText("GPT-4o Mini")).toBeInTheDocument();
      expect(screen.getByText("llama3")).toBeInTheDocument();
    });
  });

  it("calls onSelect with first model on mount", async () => {
    mockFetchModels.mockResolvedValue(openaiModels);
    const onSelect = vi.fn();

    render(<ModelSelector value={null} onSelect={onSelect} />);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({ provider: "openai", id: "gpt-4o" });
    });
  });

  it("calls onSelect with correct ModelSelection on change", async () => {
    mockFetchModels.mockResolvedValue([...openaiModels, ...ollamaModels]);
    const onSelect = vi.fn();

    render(<ModelSelector value={{ provider: "openai", id: "gpt-4o" }} onSelect={onSelect} />);

    await waitFor(() => screen.getByText("GPT-4o Mini"));

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "openai:gpt-4o-mini" } });

    expect(onSelect).toHaveBeenCalledWith({ provider: "openai", id: "gpt-4o-mini" });
  });

  it("renders empty select without crashing on fetch error", async () => {
    mockFetchModels.mockRejectedValue(new Error("network error"));

    render(<ModelSelector value={null} onSelect={() => {}} />);

    await waitFor(() => {
      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
      // No options visible
      expect(select.querySelectorAll("option")).toHaveLength(0);
    });
  });

  it("groups options by provider label (OpenAI / Ollama)", async () => {
    mockFetchModels.mockResolvedValue([...openaiModels, ...ollamaModels]);

    render(<ModelSelector value={null} onSelect={() => {}} />);

    await waitFor(() => {
      const openaiGroup = screen.getByRole("group", { name: "OpenAI" });
      const ollamaGroup = screen.getByRole("group", { name: "Ollama" });
      expect(openaiGroup).toBeInTheDocument();
      expect(ollamaGroup).toBeInTheDocument();
    });
  });
});
