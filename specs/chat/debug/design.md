# Design — Chat Debug Panel

## Data Model

```ts
// client/src/lib/types.ts

type DebugActor =
  | 'llm'          // LLM provider (OpenAI / Ollama)
  | 'mcp-client'   // MCP SDK Client, tool invocation intent from LLM
  | 'mcp-server'   // MCP SDK Client, tool result returned from server
  | 'oauth'        // OAuth flow events (during tool call)
  | 'bridge'       // ChatGPT Apps SDK iframe bridge (McpResourceFrame / window.openai shim)
  | 'error';       // Any caught error in the above

interface DebugEvent {
  id: string;             // crypto.randomUUID()
  timestamp: Date;        // new Date() at emission point
  actor: DebugActor;
  type: string;           // e.g. 'step-start' | 'step-finish' | 'tool-decision' | 'tool-call' | 'tool-result' | 'tool-error' | 'oauth-start' | 'oauth-token' | 'oauth-refresh'
  summary: string;        // one-liner, displayed without expansion
  payload?: string;       // JSON.stringify(data, null, 2), capped at 10 240 chars + '[TRUNCATED]'
  correlationId?: string; // optional: ties tool-call event to its tool-result/error (use toolCallId from Vercel AI SDK)
  step?: number;          // optional: which streamText step this event belongs to (1-indexed)
  durationMs?: number;    // optional: elapsed time for response/result events
}
```

Payload cap helper:
```ts
function serializePayload(data: unknown): string {
  const raw = JSON.stringify(data, null, 2) ?? '';
  if (raw.length > 10_240) return raw.slice(0, 10_240) + '\n[TRUNCATED]';
  return raw;
}
```

Download format (NDJSON):
```ts
function toNdjson(events: DebugEvent[]): string {
  return events.map(e => JSON.stringify(e)).join('\n');
}
```

---

## Interfaces

### StreamDebugEvent (shared/types.ts)

```ts
interface StreamDebugEvent {
  type: 'debug';
  event: Omit<DebugEvent, 'timestamp'> & { timestamp: string }; // ISO string for JSON transport
}
```

### DebugContext (client/src/lib/debug-context.tsx)

```ts
// Two separate contexts to prevent over-rendering

const DebugEmitContext = createContext<{ emit: (event: DebugEvent) => void; clear: () => void }>(…);
const DebugLogContext  = createContext<DebugEvent[]>([]);

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const emit = useCallback((event: DebugEvent) => {
    setEvents(prev => [...prev, event]);
  }, []);
  const clear = useCallback(() => setEvents([]), []);
  return (
    <DebugEmitContext.Provider value={{ emit, clear }}>
      <DebugLogContext.Provider value={events}>
        {children}
      </DebugLogContext.Provider>
    </DebugEmitContext.Provider>
  );
}

export const useDebugEmit = () => useContext(DebugEmitContext);
export const useDebugLog  = () => useContext(DebugLogContext);
```

### emitDebug helper (server/routes/chat.ts)

The `emitDebug` helper wraps debug events in the `StreamDebugEvent` format and writes to the data stream. The `emitEvent` callback is passed to `getToolsForAiSdk` for tool-level events.

```ts
function emitDebug(
  writer: DataStreamWriter,
  event: Omit<StreamDebugEvent['event'], 'id' | 'timestamp'>
) {
  try {
    writer.writeData({
      type: 'debug',
      event: {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...event,
      },
    });
  } catch { /* swallow serialisation errors */ }
}
```

### DebugPanel component (client/src/components/DebugPanel.tsx)

```ts
interface DebugPanelProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (w: number) => void;
}
```

Internally uses `useDebugLog()` for the event list and `useDebugEmit()` only for `clear`.

### DebugToggleHandle component (client/src/components/DebugToggleHandle.tsx)

```ts
interface DebugToggleHandleProps {
  isOpen: boolean;
  onToggle: () => void;
}
```

A small, lightweight tab anchored to the right edge — not a thick bar. Should use a minimal visual treatment (e.g., a short vertical label "Debug" or a small icon). Must not visually dominate or create a thick divider between chat and panel.

### App layout (client/src/App.tsx)

```tsx
const [isDebugOpen, setIsDebugOpen] = useState(false);
const [debugPanelWidth, setDebugPanelWidth] = useState(340);

<DebugProvider>
  <DebugConversationClear conversationId={activeConversationId} />
  <div style={{ display: 'flex', height: '100vh' }}>
    <Sidebar ... />
    <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <Chat ... />                        {/* flex: 1, min-width: 400px */}
      <DebugToggleHandle ... />           {/* lightweight tab */}
      {isDebugOpen && (
        <DebugPanel
          width={debugPanelWidth}
          onClose={...}
          onWidthChange={setDebugPanelWidth}
        />
      )}
    </main>
  </div>
</DebugProvider>
```

---

## Component Design

### Event flow: server → frontend (per-step model)

```
chat.ts (Express)
  ├─ pipeDataStreamToResponse
  │   ├─ emitDebug: llm/step-start (step=1, model, toolCount, messageCount)
  │   │
  │   ├─ streamText({ ..., onStepFinish })
  │   │   │
  │   │   ├─ AI SDK calls tool execute():
  │   │   │   ├─ emitDebug: mcp-client/tool-call (toolName, args, correlationId)
  │   │   │   │   └─ startTime = Date.now()
  │   │   │   ├─ callWithAuth(...)
  │   │   │   │   ├─ 401 → emitDebug: oauth/oauth-start
  │   │   │   │   └─ token refresh → emitDebug: oauth/oauth-refresh
  │   │   │   ├─ success → emitDebug: mcp-server/tool-result (correlationId, durationMs)
  │   │   │   └─ error → emitDebug: error/tool-error (correlationId, durationMs)
  │   │   │
  │   │   └─ onStepFinish(stepResult):
  │   │       ├─ if finishReason === 'tool-calls':
  │   │       │   └─ emitDebug: llm/tool-decision (toolCalls: [{name, args}])
  │   │       ├─ emitDebug: llm/step-finish (step, finishReason, usage, durationMs)
  │   │       └─ if next step:
  │   │           └─ emitDebug: llm/step-start (step=N+1, ...)
  │   │
  │   └─ result.mergeIntoDataStream(writer)

useChat (Chat.tsx)
  └─ data[] updates
      └─ useEffect → filter type==='debug' → deserialise timestamp → emit() into DebugContext

DebugPanel.tsx
  └─ useDebugLog() → group by step → render with separators, indentation, durations
```

### Panel toggle

The toggle is a small tab — not a 12px-wide permanent bar. It should be:
- Visually subtle: small rounded tab or icon that doesn't create a visual wall
- Position: anchored to the right edge of the chat area
- Behaviour: click to toggle panel open/closed

### Resize handle

The `DebugPanel`'s left border acts as a drag handle:
- **Visible**: 1px border line
- **Hit target**: 8px wide invisible grab area (positioned with absolute/negative offset)
- **Hover feedback**: cursor changes to `col-resize`; drag indicator appears (e.g. subtle highlight)
- **Drag behaviour**: dragging left increases panel width, dragging right decreases it
- **Clamping**: min 240px, max = viewport width - left sidebar width - 400px (protects chat area)

```tsx
function onMouseDown(e: React.MouseEvent) {
  const startX = e.clientX;
  const startWidth = width;
  const maxWidth = window.innerWidth - 280 /* sidebar */ - 400 /* min chat */;
  const onMove = (e: MouseEvent) => {
    const delta = startX - e.clientX;
    onWidthChange(Math.max(240, Math.min(startWidth + delta, maxWidth)));
  };
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
```

### Auto-scroll

```tsx
const bottomRef = useRef<HTMLDivElement>(null);
const isUserScrolledUp = useRef(false);

// On scroll: detect manual scroll-up
// On new event: if !isUserScrolledUp → bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
```

### Event rendering

Each event entry has:
1. **Left border** (3px) coloured by actor
2. **Timestamp** `[HH:MM:SS.mmm]` in muted text
3. **Actor label** `[llm]` with actor colour
4. **Direction indicator** `→` for outgoing, `←` for incoming
5. **Summary text** with optional duration badge `(1.2s)`
6. **Click to expand** payload as formatted JSON

Correlated events (tool-result/error matching a tool-call via `correlationId`) are indented under the tool-call entry.

Step separators are rendered before step-start events:
```
─── Step 1 ──────────────────────────
[12:00:01.123] [llm] → Request sent (3 tools)
[12:00:02.456] [llm] ← Finish: tool-calls (1.3s)
[12:00:02.458] [llm]   Tools chosen: sipcoffee__list_cocktails
[12:00:02.460] [mcp] → callTool: list_cocktails
[12:00:02.890] [mcp]   ← result (430ms)
─── Step 2 ──────────────────────────
[12:00:02.895] [llm] → Request sent (tool results included)
[12:00:04.100] [llm] ← Finish: stop (1.2s)
```

### Actor colour mapping (Tailwind hardcoded)

```ts
const ACTOR_COLORS: Record<DebugActor, string> = {
  'llm':        'text-blue-400',
  'mcp-client': 'text-purple-400',
  'mcp-server': 'text-green-400',
  'oauth':      'text-orange-400',
  'bridge':     'text-pink-400',
  'error':      'text-red-400',
};

const ACTOR_BORDER_COLORS: Record<DebugActor, string> = {
  'llm':        'border-blue-400',
  'mcp-client': 'border-purple-400',
  'mcp-server': 'border-green-400',
  'oauth':      'border-orange-400',
  'bridge':     'border-pink-400',
  'error':      'border-red-400',
};
```

### Quick filters

Toggle buttons in the panel header bar, below the title row:
- `LLM` | `MCP` | `OAuth` | `Errors`
- All enabled by default
- `LLM` filters actor `llm`
- `MCP` filters actors `mcp-client` and `mcp-server`
- `OAuth` filters actor `oauth`
- `Errors` filters actor `error`
- Filters are OR-based: event is shown if its actor matches any enabled filter

---

## Key Decisions

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| Log storage | In-memory React state, cleared on conversation switch | localStorage (rejected — logs are ephemeral debug data, not app state) |
| Event bridge | Extend existing `emitEvent` → AI SDK data stream → `useChat` data | Separate `GET /api/debug/stream` SSE endpoint (rejected — adds complexity, second connection) |
| Context split | `DebugEmitContext` + `DebugLogContext` | Single context (rejected — causes all emitting components to re-render on each log entry) |
| Provider placement | `App` level | Inside `Chat` (rejected — panel must be a sibling to `Chat` in the layout, and `App` needs to call `clear()`) |
| Out-of-band events | Descoped | Buffer in server memory and replay on next chat request (rejected — high complexity, confusing UX) |
| MCP event granularity | Logical call/result only | Wire-level JSON-RPC (rejected — SDK Client does not expose transport hooks) |
| LLM event granularity | Per-step events via `onStepFinish` | Single request + response pair (rejected — hides multi-step tool loops; the user cannot tell what the LLM decided or which step they're on) |
| LLM tool decisions | Explicit `tool-decision` event on `finishReason: 'tool-calls'` | Rely on tool-call events only (rejected — doesn't show what the LLM chose, only what was executed) |
| Duration tracking | `durationMs` field on response/result events | No timing (rejected — developers need to identify slow steps) |
| Toggle affordance | Lightweight tab anchored to right edge | 12px-wide always-visible bar (rejected — creates ugly visual wall between chat and panel) |
| Default panel width | 340px | 400px (rejected — too aggressive on typical screens, eats too much chat space) |
| Max panel width | Viewport - sidebar - 400px (min chat) | 80% of viewport (rejected — doesn't protect chat area from being crushed) |
| Download format | NDJSON | JSON array (NDJSON chosen for streaming parsability and easy `grep`) |
| Event grouping | Visual indentation by correlationId + step separators | Flat list (rejected — related events are hard to follow in a flat stream) |
| Quick filters | Toggle buttons for LLM/MCP/OAuth/Errors | No filtering (rejected — when debugging a specific layer, irrelevant events add noise) |
