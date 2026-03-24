import { describe, it, expect, beforeEach } from "vitest";
import {
  loadConversations,
  saveConversations,
  loadActiveId,
  saveActiveId,
  STORAGE_KEYS,
} from "./storage";
import type { Conversation } from "./types";

// vitest uses jsdom by default which provides localStorage

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Test",
    messages: [],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("loadConversations", () => {
  it("returns [] when localStorage is empty", () => {
    expect(loadConversations()).toEqual([]);
  });

  it("parses stored conversations correctly", () => {
    const convs: Conversation[] = [
      makeConversation({ id: "1", title: "First" }),
      makeConversation({ id: "2", title: "Second" }),
    ];
    localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(convs));
    expect(loadConversations()).toEqual(convs);
  });

  it("returns [] on invalid JSON without throwing", () => {
    localStorage.setItem(STORAGE_KEYS.conversations, "not-valid-json{{{");
    expect(() => loadConversations()).not.toThrow();
    expect(loadConversations()).toEqual([]);
  });
});

describe("saveConversations", () => {
  it("saves and reloads conversations correctly", () => {
    const convs = [makeConversation({ id: "a" }), makeConversation({ id: "b" })];
    saveConversations(convs);
    expect(loadConversations()).toEqual(convs);
  });

  it("prunes to 50 when limit exceeded (removes oldest = those beyond index 50)", () => {
    // Create 60 conversations; they are ordered newest-first (index 0 = newest)
    const convs: Conversation[] = Array.from({ length: 60 }, (_, i) =>
      makeConversation({ id: String(i), title: `Conv ${i}` })
    );
    saveConversations(convs);
    const loaded = loadConversations();
    expect(loaded.length).toBe(50);
    // First 50 (newest) should be kept
    expect(loaded[0].id).toBe("0");
    expect(loaded[49].id).toBe("49");
  });

  it("saves exactly 50 conversations without pruning", () => {
    const convs: Conversation[] = Array.from({ length: 50 }, (_, i) =>
      makeConversation({ id: String(i) })
    );
    saveConversations(convs);
    expect(loadConversations().length).toBe(50);
  });
});

describe("loadActiveId / saveActiveId", () => {
  it("returns null when nothing is stored", () => {
    expect(loadActiveId()).toBeNull();
  });

  it("roundtrips an id correctly", () => {
    saveActiveId("conv-123");
    expect(loadActiveId()).toBe("conv-123");
  });

  it("clears the key when null is passed", () => {
    saveActiveId("some-id");
    saveActiveId(null);
    expect(loadActiveId()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.activeId)).toBeNull();
  });
});
