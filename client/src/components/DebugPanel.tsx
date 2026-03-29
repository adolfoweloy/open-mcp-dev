import { Fragment, useEffect, useRef, useState } from "react";
import type { DebugActor, DebugEvent } from "../lib/types";
import { useDebugEmit, useDebugLog } from "../lib/debug-context";

const ACTOR_COLORS: Record<DebugActor, string> = {
  llm: "text-blue-400",
  "mcp-client": "text-purple-400",
  "mcp-server": "text-green-400",
  oauth: "text-orange-400",
  bridge: "text-pink-400",
  error: "text-red-400",
};

const ACTOR_BORDER_COLORS: Record<DebugActor, string> = {
  llm: "border-l-blue-400",
  "mcp-client": "border-l-purple-400",
  "mcp-server": "border-l-green-400",
  oauth: "border-l-orange-400",
  bridge: "border-l-pink-400",
  error: "border-l-red-400",
};

function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

function StepSeparator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 py-2 select-none">
      <div className="flex-1 h-px bg-neutral-700" />
      <span className="text-[10px] font-mono font-semibold text-neutral-500 shrink-0">
        Step {step}
      </span>
      <div className="flex-1 h-px bg-neutral-700" />
    </div>
  );
}

const OUTGOING_TYPES = new Set(["step-start", "tool-call"]);
const INCOMING_TYPES = new Set(["step-finish", "tool-decision", "tool-result", "tool-error"]);

function getDirectionIndicator(type: string): string {
  if (OUTGOING_TYPES.has(type)) return "→";
  if (INCOMING_TYPES.has(type)) return "←";
  return "";
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `(${(ms / 1000).toFixed(1)}s)`;
  return `(${ms}ms)`;
}

function EventEntry({ event, isCorrelated }: { event: DebugEvent; isCorrelated?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = ACTOR_COLORS[event.actor];
  const borderClass = ACTOR_BORDER_COLORS[event.actor];
  const direction = getDirectionIndicator(event.type);

  return (
    <div
      className={`border-b border-neutral-800 border-l-[3px] ${borderClass} py-1 pl-2 cursor-pointer hover:bg-neutral-800/50${isCorrelated ? " ml-4" : ""}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-1 font-mono text-[11px]">
        <span className="text-neutral-500 shrink-0">
          [{formatTimestamp(event.timestamp)}]
        </span>
        <span className={`shrink-0 font-semibold ${colorClass}`}>
          [{event.actor}]
        </span>
        {direction && (
          <span className="text-neutral-400 shrink-0">{direction}</span>
        )}
        <span className="text-neutral-300 break-all">{event.summary}</span>
        {event.durationMs !== undefined && (
          <span className="text-neutral-500 shrink-0 ml-1">
            {formatDuration(event.durationMs)}
          </span>
        )}
      </div>
      {expanded && event.payload && (
        <pre className="mt-1 ml-2 text-[10px] text-neutral-400 whitespace-pre-wrap break-all bg-neutral-900 p-2 rounded">
          {event.payload}
        </pre>
      )}
    </div>
  );
}

interface DebugPanelProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (w: number) => void;
}

export function DebugPanel({ width, onClose, onWidthChange }: DebugPanelProps) {
  const events = useDebugLog();
  const { clear } = useDebugEmit();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const prevEventCount = useRef(events.length);

  // Auto-scroll to bottom on new events unless user scrolled up
  useEffect(() => {
    if (events.length > prevEventCount.current) {
      prevEventCount.current = events.length;
      if (!isUserScrolledUp.current) {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [events]);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    isUserScrolledUp.current = !atBottom;
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const maxWidth = window.innerWidth - 280 /* sidebar */ - 400 /* min chat */;
      const clamped = Math.max(240, Math.min(startWidth + delta, maxWidth));
      onWidthChange(clamped);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleDownload() {
    const ndjson = events.map((e) => JSON.stringify(e)).join("\n");
    const blob = new Blob([ndjson], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debug-chat.log";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{ width: `${width}px`, position: "relative" }}
      className="flex-shrink-0 flex flex-col bg-neutral-900 overflow-hidden"
    >
      {/* Resize handle — 8px grab area straddling the left edge, 1px visible line */}
      <div
        data-testid="resize-grab-area"
        onMouseDown={handleResizeMouseDown}
        className="absolute top-0 bottom-0 left-[-4px] w-2 cursor-col-resize z-10 group"
      >
        <div
          data-testid="resize-visible-line"
          className="absolute top-0 bottom-0 left-[4px] w-px bg-neutral-700 group-hover:bg-blue-400 transition-colors"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between pl-3 pr-2 py-1.5 border-b border-neutral-700 shrink-0">
        <span className="text-xs font-semibold text-neutral-300">Debug</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            disabled={events.length === 0}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 disabled:opacity-40 px-1.5 py-0.5 rounded hover:bg-neutral-700"
            title="Download as NDJSON"
          >
            ↓ Download
          </button>
          <button
            onClick={clear}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 px-1.5 py-0.5 rounded hover:bg-neutral-700"
            title="Clear log"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="text-[10px] text-neutral-400 hover:text-neutral-200 px-1 py-0.5 rounded hover:bg-neutral-700"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Event list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pl-3 pr-2"
      >
        {events.length === 0 ? (
          <p className="text-[11px] text-neutral-600 py-4 text-center">No events yet.</p>
        ) : (() => {
          // Build set of correlationIds seen in tool-call events so we can indent correlated responses
          const toolCallCorrelationIds = new Set<string>();
          for (const event of events) {
            if (event.type === "tool-call" && event.correlationId) {
              toolCallCorrelationIds.add(event.correlationId);
            }
          }

          return events.map((event) => {
            const isCorrelated =
              !!event.correlationId &&
              event.type !== "tool-call" &&
              toolCallCorrelationIds.has(event.correlationId);
            return (
              <Fragment key={event.id}>
                {event.type === "step-start" && (
                  <StepSeparator step={event.step ?? 1} />
                )}
                <EventEntry event={event} isCorrelated={isCorrelated} />
              </Fragment>
            );
          });
        })()}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
