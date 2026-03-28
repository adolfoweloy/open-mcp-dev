import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugToggleHandle } from "./DebugToggleHandle";

describe("DebugToggleHandle", () => {
  it("renders and is visible", () => {
    render(<DebugToggleHandle isOpen={false} onToggle={vi.fn()} />);
    const handle = screen.getByRole("button");
    expect(handle).toBeInTheDocument();
  });

  it("clicking calls onToggle", () => {
    const onToggle = vi.fn();
    render(<DebugToggleHandle isOpen={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows open indicator when isOpen=false (panel closed, arrow points to open direction)", () => {
    render(<DebugToggleHandle isOpen={false} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", "Open debug panel");
  });

  it("shows close indicator when isOpen=true (panel open, arrow points to close direction)", () => {
    render(<DebugToggleHandle isOpen={true} onToggle={vi.fn()} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("title", "Close debug panel");
  });

  it("visual indicator reflects isOpen state via data-open attribute", () => {
    const { rerender } = render(
      <DebugToggleHandle isOpen={false} onToggle={vi.fn()} />
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-open", "false");

    rerender(<DebugToggleHandle isOpen={true} onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-open", "true");
  });
});
