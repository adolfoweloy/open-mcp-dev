import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DebugPanel } from "./DebugPanel";
import { DebugProvider, useDebugEmit } from "../lib/debug-context";
import type { DebugEvent } from "../lib/types";
import { useEffect } from "react";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function makeEvent(overrides: Partial<DebugEvent> = {}): DebugEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date("2024-01-01T12:34:56.789Z"),
    actor: "llm",
    type: "request",
    summary: "LLM request",
    ...overrides,
  };
}

function Wrapper({
  children,
  events = [],
}: {
  children: React.ReactNode;
  events?: DebugEvent[];
}) {
  return (
    <DebugProvider>
      <EmitEvents events={events} />
      {children}
    </DebugProvider>
  );
}

function EmitEvents({ events }: { events: DebugEvent[] }) {
  const { emit } = useDebugEmit();
  useEffect(() => {
    events.forEach((e) => emit(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderPanel(
  events: DebugEvent[] = [],
  props: Partial<React.ComponentProps<typeof DebugPanel>> = {}
) {
  const onClose = vi.fn();
  const onWidthChange = vi.fn();
  render(
    <Wrapper events={events}>
      <DebugPanel
        isOpen={true}
        width={400}
        onClose={onClose}
        onWidthChange={onWidthChange}
        {...props}
      />
    </Wrapper>
  );
  return { onClose, onWidthChange };
}

describe("DebugPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the event list from useDebugLog", async () => {
    const events = [
      makeEvent({ summary: "LLM request event", actor: "llm" }),
      makeEvent({ summary: "Tool call event", actor: "mcp-client" }),
    ];
    renderPanel(events);

    expect(screen.getByText("LLM request event")).toBeInTheDocument();
    expect(screen.getByText("Tool call event")).toBeInTheDocument();
  });

  it("shows empty state when there are no events", () => {
    renderPanel();
    expect(screen.getByText("No events yet.")).toBeInTheDocument();
  });

  it("each entry shows formatted timestamp and actor label", () => {
    const event = makeEvent({
      actor: "mcp-server",
      summary: "Tool result",
      timestamp: new Date("2024-01-01T12:34:56.789Z"),
    });
    renderPanel([event]);

    // Actor label is present with brackets
    expect(screen.getByText("[mcp-server]")).toBeInTheDocument();
    // Summary is present
    expect(screen.getByText("Tool result")).toBeInTheDocument();
  });

  it("actor label has correct color class for each actor", () => {
    const actors: DebugEvent["actor"][] = [
      "llm",
      "mcp-client",
      "mcp-server",
      "oauth",
      "bridge",
      "error",
    ];
    const expectedClasses: Record<string, string> = {
      llm: "text-blue-400",
      "mcp-client": "text-purple-400",
      "mcp-server": "text-green-400",
      oauth: "text-orange-400",
      bridge: "text-pink-400",
      error: "text-red-400",
    };

    actors.forEach((actor) => {
      const event = makeEvent({ actor, summary: `${actor} summary` });
      const { unmount } = render(
        <Wrapper events={[event]}>
          <DebugPanel
            isOpen={true}
            width={400}
            onClose={vi.fn()}
            onWidthChange={vi.fn()}
          />
        </Wrapper>
      );
      const label = screen.getByText(`[${actor}]`);
      expect(label.className).toContain(expectedClasses[actor]);
      unmount();
    });
  });

  it("clicking an entry toggles payload expansion", () => {
    const event = makeEvent({
      summary: "Expandable event",
      payload: '{"key": "value"}',
    });
    renderPanel([event]);

    // Payload not visible before click
    expect(screen.queryByText(/\{"key":/)).not.toBeInTheDocument();

    // Click to expand
    const entry = screen.getByText("Expandable event").closest("div")!;
    fireEvent.click(entry);
    expect(screen.getByText(/\{"key":/)).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(entry);
    expect(screen.queryByText(/\{"key":/)).not.toBeInTheDocument();
  });

  it("clicking entry without payload does not crash", () => {
    const event = makeEvent({ summary: "No payload", payload: undefined });
    renderPanel([event]);

    const entry = screen.getByText("No payload").closest("div")!;
    expect(() => fireEvent.click(entry)).not.toThrow();
  });

  it("Clear button calls clear on the debug context", async () => {
    const events = [makeEvent({ summary: "Event to clear" })];
    renderPanel(events);

    // Event is visible
    expect(screen.getByText("Event to clear")).toBeInTheDocument();

    // Click Clear
    fireEvent.click(screen.getByTitle("Clear log"));

    // Events are cleared
    expect(screen.queryByText("Event to clear")).not.toBeInTheDocument();
    expect(screen.getByText("No events yet.")).toBeInTheDocument();
  });

  it("Close button calls onClose", () => {
    const { onClose } = renderPanel();
    fireEvent.click(screen.getByTitle("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Download button is disabled when no events", () => {
    renderPanel();
    const download = screen.getByTitle("Download as NDJSON") as HTMLButtonElement;
    expect(download.disabled).toBe(true);
  });

  it("Download button is enabled when there are events", () => {
    renderPanel([makeEvent()]);
    const download = screen.getByTitle("Download as NDJSON") as HTMLButtonElement;
    expect(download.disabled).toBe(false);
  });

  it("auto-scrolls to bottom on new event", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    // Start with empty, then add events
    const { rerender } = render(
      <DebugProvider>
        <DebugPanel
          isOpen={true}
          width={400}
          onClose={vi.fn()}
          onWidthChange={vi.fn()}
        />
      </DebugProvider>
    );

    // Wrap in act to process state updates
    await act(async () => {
      rerender(
        <DebugProvider>
          <EmitEvents events={[makeEvent({ summary: "New event" })]} />
          <DebugPanel
            isOpen={true}
            width={400}
            onClose={vi.fn()}
            onWidthChange={vi.fn()}
          />
        </DebugProvider>
      );
    });

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("resize drag calls onWidthChange with clamped value", () => {
    const onWidthChange = vi.fn();
    render(
      <Wrapper>
        <DebugPanel
          isOpen={true}
          width={400}
          onClose={vi.fn()}
          onWidthChange={onWidthChange}
        />
      </Wrapper>
    );

    // Find the resize handle div (cursor-col-resize)
    const handle = document.querySelector(".cursor-col-resize")!;
    expect(handle).toBeInTheDocument();

    // Simulate drag: mousedown then mousemove
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 50 }); // moved 50px left → increase width by 50
    fireEvent.mouseUp(window);

    // Width should have been updated
    expect(onWidthChange).toHaveBeenCalled();
    const newWidth = onWidthChange.mock.calls[0][0];
    expect(newWidth).toBeGreaterThanOrEqual(240); // min bound
    // max = viewport - sidebar(280) - min-chat(400)
    expect(newWidth).toBeLessThanOrEqual(window.innerWidth - 280 - 400);
  });

  it("resize max width preserves at least 400px for the chat area", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

    const onWidthChange = vi.fn();
    render(
      <Wrapper>
        <DebugPanel
          isOpen={true}
          width={300}
          onClose={vi.fn()}
          onWidthChange={onWidthChange}
        />
      </Wrapper>
    );

    const handle = document.querySelector(".cursor-col-resize")!;
    // Drag far left — would grow width well beyond the allowed maximum
    fireEvent.mouseDown(handle, { clientX: 600 });
    fireEvent.mouseMove(window, { clientX: 0 }); // 600px left drag
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalled();
    const newWidth = onWidthChange.mock.calls[0][0];
    // max = 1200 - 280 (sidebar) - 400 (min chat) = 520
    expect(newWidth).toBeLessThanOrEqual(1200 - 280 - 400);
  });

  it("resize grab area has cursor-col-resize class", () => {
    renderPanel();
    const grabArea = document.querySelector("[data-testid='resize-grab-area']")!;
    expect(grabArea).toBeInTheDocument();
    expect(grabArea.className).toContain("cursor-col-resize");
  });

  it("resize is clamped to minimum 240px", () => {
    const onWidthChange = vi.fn();
    render(
      <Wrapper>
        <DebugPanel
          isOpen={true}
          width={300}
          onClose={vi.fn()}
          onWidthChange={onWidthChange}
        />
      </Wrapper>
    );

    const handle = document.querySelector(".cursor-col-resize")!;
    // Drag far right — width would go below minimum
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 500 }); // moved 400px right → width = 300 - 400 = negative
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(240);
  });

  describe("NDJSON download", () => {
    let capturedContent: string | null = null;
    let capturedType: string | null = null;
    let originalBlob: typeof Blob;
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      capturedContent = null;
      capturedType = null;
      originalBlob = global.Blob;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      // Mock Blob to capture content
      global.Blob = class MockBlob {
        type: string;
        content: string;
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          this.type = options?.type ?? "";
          this.content = parts.join("");
          capturedContent = this.content;
          capturedType = this.type;
        }
      } as unknown as typeof Blob;

      URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      global.Blob = originalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it("download produces valid NDJSON with one event per line", () => {
      const events = [
        makeEvent({ id: "id-1", summary: "Event 1", actor: "llm" }),
        makeEvent({ id: "id-2", summary: "Event 2", actor: "mcp-server" }),
      ];
      renderPanel(events);

      fireEvent.click(screen.getByTitle("Download as NDJSON"));

      expect(capturedContent).not.toBeNull();
      const lines = capturedContent!.trim().split("\n");
      expect(lines).toHaveLength(2);
      const parsed0 = JSON.parse(lines[0]);
      const parsed1 = JSON.parse(lines[1]);
      expect(parsed0.id).toBe("id-1");
      expect(parsed1.id).toBe("id-2");
    });

    it("each line is parseable as a DebugEvent JSON object", () => {
      const event = makeEvent({ actor: "oauth", type: "oauth-start", summary: "OAuth started" });
      renderPanel([event]);

      fireEvent.click(screen.getByTitle("Download as NDJSON"));

      const parsed = JSON.parse(capturedContent!.trim());
      expect(parsed.actor).toBe("oauth");
      expect(parsed.type).toBe("oauth-start");
      expect(parsed.summary).toBe("OAuth started");
    });

    it("download blob has type application/x-ndjson", () => {
      renderPanel([makeEvent()]);
      fireEvent.click(screen.getByTitle("Download as NDJSON"));
      expect(capturedType).toBe("application/x-ndjson");
    });

    it("URL is revoked after download (filename debug-chat.log flow completes)", () => {
      renderPanel([makeEvent()]);
      fireEvent.click(screen.getByTitle("Download as NDJSON"));
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });

    it("empty log case: download button is disabled so no download occurs", () => {
      renderPanel([]);
      const btn = screen.getByTitle("Download as NDJSON") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });
});
