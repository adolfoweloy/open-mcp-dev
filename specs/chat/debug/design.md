# Design — Chat Debug Panel

## Data Model

```ts
// shared/types.ts (or client/src/lib/types.ts — frontend-only, no server import needed)

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
  type: string;           // e.g. 'request' | 'response' | 'tool-call' | 'tool-result' | 'tool-error' | 'oauth-start' | 'oauth-token' | 'oauth-refresh'
  summary: string;        // one-liner, displayed without expansion
  payload?: string;       // JSON.stringify(data, null, 2), capped at 10 240 chars + '[TRUNCATED]'
  correlationId?: string; // optional: ties tool-call event to its tool-result/error (use toolCallId from Vercel AI SDK)
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

### DebugContext (client/src/lib/debug-context.tsx)

```ts
// Two separate contexts to prevent over-rendering

const DebugEmitContext = createContext<(event: DebugEvent) => void>(() => {});
const DebugLogContext  = createContext<DebugEvent[]>([]);

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const emit = useCallback((event: DebugEvent) => {
    setEvents(prev => [...prev, event]);
  }, []);
  return (
    <DebugEmitContext.Provider value={emit}>
      <DebugLogContext.Provider value={events}>
        {children}
      </DebugLogContext.Provider>
    </DebugEmitContext.Provider>
  );
}

export const useDebugEmit = () => useContext(DebugEmitContext);
export const useDebugLog  = () => useContext(DebugLogContext);
```

### emitEvent callback (server/routes/chat.ts)

The existing `emitEvent` callback signature is extended to accept a structured debug event type. The server serialises this into the Vercel AI SDK data stream using `dataStreamWriter.writeData(...)`.

```ts
// Extended type (server-side, in shared/types.ts or inline in chat.ts)
interface StreamDebugEvent {
  type: 'debug';
  event: Omit<DebugEvent, 'timestamp'> & { timestamp: string }; // ISO string for JSON transport
}
```

On the frontend, `Chat.tsx` already processes `useChat`'s `data` array. A new `useEffect` on `data` picks up `type === 'debug'` entries, deserialises the timestamp, and calls `emit()`.

### DebugPanel component (client/src/components/DebugPanel.tsx)

```ts
interface DebugPanelProps {
  isOpen: boolean;
  width: number;
  onClose: () => void;
  onWidthChange: (w: number) => void;
}
```

Internally uses `useDebugLog()` for the event list and `useDebugEmit()` is not needed (panel does not emit).

### App layout changes (client/src/App.tsx)

```tsx
// New state:
const [isDebugOpen, setIsDebugOpen] = useState(false);
const [debugPanelWidth, setDebugPanelWidth] = useState(400);

// Clear log on conversation change:
const clearDebugLog = /* from DebugProvider via context or passed down */;
useEffect(() => { clearDebugLog(); }, [activeConversationId]);

// Layout (pseudocode):
<DebugProvider>
  <div style={{ display: 'flex', height: '100vh' }}>
    <Sidebar ... />                          {/* fixed width */}
    <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <Chat ... />                           {/* flex: 1 */}
      <DebugToggleHandle onClick={...} />    {/* thin strip on right of chat column */}
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

`DebugProvider` must also expose a `clear()` function. Options:
- Add `clearDebugLog` to `DebugEmitContext` alongside `emit`
- Or use a ref-based imperative handle

Simpler: expose `{ emit, clear }` from `DebugEmitContext`.

---

## Component Design

### Event flow: server → frontend

```
chat.ts (Express)
  ├─ before streamText  →  emit LLM request event  →  dataStreamWriter.writeData({ type: 'debug', event: {...} })
  ├─ getToolsForAiSdk execute wrapper
  │   ├─ tool-call intent  →  emit mcp-client event
  │   ├─ callWithAuth(...)
  │   │   ├─ 401 → OAuth start  →  emit oauth event
  │   │   └─ token refresh      →  emit oauth event
  │   ├─ callTool success  →  emit mcp-server event
  │   └─ callTool error    →  emit error event
  └─ onFinish callback    →  emit LLM response event

useChat (Chat.tsx)
  └─ data[] updates
      └─ useEffect → filter type==='debug' → deserialise timestamp → emit() into DebugContext

DebugPanel.tsx
  └─ useDebugLog() → render event list
```

### Resize handle

The `DebugPanel`'s left border acts as a drag handle:

```tsx
// Simplified drag logic
function onMouseDown(e: React.MouseEvent) {
  const startX = e.clientX;
  const startWidth = width;
  const onMove = (e: MouseEvent) => {
    const delta = startX - e.clientX; // dragging left increases width
    onWidthChange(Math.max(240, Math.min(startWidth + delta, window.innerWidth * 0.8)));
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
```

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
| LLM event granularity | One request + one `onFinish` response | Per-chunk events (rejected — conflicts with `mergeIntoDataStream`, limited value) |
| Download format | NDJSON | JSON array (NDJSON chosen for streaming parsability and easy `grep`) |
| Panel overflow fix | Panel sits inside `main` flex row; `main` gets `overflow: hidden` on the outer div only, panel itself gets its own scroll | Changing `App`'s existing overflow (avoided to prevent regressions) |
