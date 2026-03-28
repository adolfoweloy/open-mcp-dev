import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ConversationItem } from "./ConversationItem";
import type { Conversation } from "../lib/types";

function makeConv(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "conv-1",
    title: "My Conversation",
    messages: [],
    ...overrides,
  };
}

function defaultProps(overrides?: Partial<Parameters<typeof ConversationItem>[0]>) {
  return {
    conversation: makeConv(),
    isActive: false,
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function renderInList(props: ReturnType<typeof defaultProps>) {
  return render(
    <ul>
      <ConversationItem {...props} />
    </ul>
  );
}

describe("ConversationItem", () => {
  beforeEach(() => {
    // Reset body portal content between tests
    document.body.innerHTML = "";
  });

  it("renders the conversation title", () => {
    renderInList(defaultProps());
    expect(screen.getByRole("button", { name: "My Conversation" })).toBeInTheDocument();
  });

  it("calls onSelect with conversation id when title button is clicked", () => {
    const onSelect = vi.fn();
    renderInList(defaultProps({ onSelect }));
    fireEvent.click(screen.getByRole("button", { name: "My Conversation" }));
    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("meatball button is hidden when not hovered", () => {
    renderInList(defaultProps());
    // visibility: hidden elements don't get accessible names computed, use DOM query directly
    const meatball = document.querySelector('[aria-label="Conversation options"]') as HTMLElement;
    expect(meatball).toBeInTheDocument();
    expect(meatball).toHaveStyle({ visibility: "hidden" });
  });

  it("meatball button becomes visible on mouse enter", () => {
    renderInList(defaultProps());
    const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
    fireEvent.mouseEnter(li);
    const meatball = screen.getByRole("button", { name: "Conversation options" });
    expect(meatball).toHaveStyle({ visibility: "visible" });
  });

  it("meatball button is hidden again after mouse leave", () => {
    renderInList(defaultProps());
    const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
    fireEvent.mouseEnter(li);
    fireEvent.mouseLeave(li);
    const meatball = document.querySelector('[aria-label="Conversation options"]') as HTMLElement;
    expect(meatball).toBeInTheDocument();
    expect(meatball).toHaveStyle({ visibility: "hidden" });
  });

  describe("meatball menu", () => {
    function openMenu() {
      renderInList(defaultProps());
      const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      const meatball = within(li).getByRole("button", { name: "Conversation options" });
      fireEvent.click(meatball);
    }

    it("clicking meatball opens a dropdown with Rename and Delete", () => {
      openMenu();
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    });

    it("menu closes on outside mousedown", () => {
      openMenu();
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("menu closes on Escape keydown", () => {
      openMenu();
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("clicking Delete calls onDelete and closes menu", () => {
      const onDelete = vi.fn();
      renderInList(defaultProps({ onDelete }));
      const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      const meatball = within(li).getByRole("button", { name: "Conversation options" });
      fireEvent.click(meatball);
      fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledWith("conv-1");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("menu renders via portal (not clipped by sidebar overflow)", () => {
      openMenu();
      const menu = screen.getByRole("menu");
      // Portal content is a direct child of document.body, not the sidebar li
      expect(document.body.contains(menu)).toBe(true);
      expect(menu.closest("li")).toBeNull();
    });
  });

  describe("rename modal", () => {
    function openRenameModal(conv?: Partial<Conversation>, props?: Partial<Parameters<typeof ConversationItem>[0]>) {
      renderInList(defaultProps({ conversation: makeConv(conv), ...props }));
      const li = screen.getByRole("button", { name: conv?.title ?? "My Conversation" }).closest("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      const meatball = within(li).getByRole("button", { name: "Conversation options" });
      fireEvent.click(meatball);
      fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    }

    it("clicking Rename opens a modal dialog with input pre-filled with current title", () => {
      openRenameModal();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-label", "Rename conversation");
      const input = dialog.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("My Conversation");
    });

    it("clicking Rename closes the meatball menu", () => {
      openRenameModal();
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("Save with non-empty input calls onRename and closes modal", () => {
      const onRename = vi.fn();
      openRenameModal({}, { onRename });
      const dialog = screen.getByRole("dialog");
      const input = dialog.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onRename).toHaveBeenCalledWith("conv-1", "New Title");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("pressing Enter on input calls onRename and closes modal", () => {
      const onRename = vi.fn();
      openRenameModal({}, { onRename });
      const dialog = screen.getByRole("dialog");
      const input = dialog.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Via Enter" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onRename).toHaveBeenCalledWith("conv-1", "Via Enter");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Save with empty input does not call onRename (modal stays open)", () => {
      const onRename = vi.fn();
      openRenameModal({}, { onRename });
      const dialog = screen.getByRole("dialog");
      const input = dialog.querySelector("input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onRename).not.toHaveBeenCalled();
      // modal stays open
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("Cancel button closes modal without calling onRename", () => {
      const onRename = vi.fn();
      openRenameModal({}, { onRename });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Escape key closes modal without calling onRename", () => {
      const onRename = vi.fn();
      openRenameModal({}, { onRename });
      const dialog = screen.getByRole("dialog");
      const input = dialog.querySelector("input") as HTMLInputElement;
      fireEvent.keyDown(input, { key: "Escape" });
      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("rename modal renders via portal (not clipped by sidebar overflow)", () => {
      openRenameModal();
      const dialog = screen.getByRole("dialog");
      expect(document.body.contains(dialog)).toBe(true);
      expect(dialog.closest("li")).toBeNull();
    });
  });

  describe("accessibility", () => {
    it("meatball trigger has aria-label='Conversation options'", () => {
      renderInList(defaultProps());
      const meatball = document.querySelector('[aria-label="Conversation options"]') as HTMLElement;
      expect(meatball).toBeInTheDocument();
      expect(meatball).toHaveAttribute("aria-label", "Conversation options");
    });

    it("menu has role='menu' and items have role='menuitem'", () => {
      renderInList(defaultProps());
      const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      fireEvent.click(within(li).getByRole("button", { name: "Conversation options" }));
      const menu = screen.getByRole("menu");
      expect(menu).toBeInTheDocument();
      const items = within(menu).getAllByRole("menuitem");
      expect(items).toHaveLength(2);
    });

    it("modal has role='dialog', aria-modal='true', and aria-label='Rename conversation'", () => {
      renderInList(defaultProps());
      const li = screen.getByRole("button", { name: "My Conversation" }).closest("li") as HTMLElement;
      fireEvent.mouseEnter(li);
      fireEvent.click(within(li).getByRole("button", { name: "Conversation options" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-label", "Rename conversation");
    });
  });
});
