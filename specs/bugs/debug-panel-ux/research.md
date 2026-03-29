# Research: bugs/debug-panel-ux

**Tier**: light
**Generated**: 2026-03-29 17:18

---

# File Mapping

Now let me check the parent flex container in App.tsx to understand the layout context.## File Mapping

### DebugPanel.tsx — Component Structure

**Finding**: `DebugPanel.tsx` is a single-file component containing 4 internal sub-components/helpers and 1 exported component.
**Location**: `client/src/components/DebugPanel.tsx`

**Internal components/helpers:**
- `formatTimestamp(date)` — line 23: formats Date → `HH:MM:SS.mmm`
- `StepSeparator({ step })` — line 31: horizontal rule with step number label
- `getDirectionIndicator(type)` — line 46: returns `→`, `←`, or `""` based on event type
- `formatDuration(ms)` — line 52: formats milliseconds to human-readable
- `EventEntry({ event, isCorrelated })` — line 57: renders a single log entry (the key component for this spec)

**Exported component:**
- `DebugPanel({ width, onClose, onWidthChange })` — line 110

---

### EventEntry — Current Expand/Collapse Behavior

**Finding**: EventEntry uses a boolean `expanded` state toggled by clicking anywhere on the entry div. There is **no visual indicator** (no triangle/chevron) showing whether an entry has a payload or is expandable.
**Location**: `client/src/components/DebugPanel.tsx:57-92`

**Details**:
- Line 58: `const [expanded, setExpanded] = useState(false);`
- Line 65: The entire entry div has `cursor-pointer` and `onClick={() => setExpanded((v) => !v)}`
- Lines 85-89: Expanded payload rendered as `<pre>` with classes: `mt-1 ml-2 text-[10px] text-neutral-400 whitespace-pre-wrap break-all bg-neutral-900 p-2 rounded`
- The payload `<pre>` has **no max-height, no overflow scroll, no left accent border** — it can grow unbounded.

---

### Scroll Container Structure

**Finding**: The event list scroll container is a `flex-1 overflow-y-auto` div but its parent (the root panel div) uses `flex flex-col` with `overflow-hidden` and does **not** have `min-h-0` on the flex child.
**Location**: `client/src/components/DebugPanel.tsx:189-289`

**Details — flex layout chain:**
1. **Root panel div** (line 193): `className="flex-shrink-0 flex flex-col bg-neutral-900 overflow-hidden"` — fixed width via inline `style={{ width }}`, acts as the column flex container.
2. **Header** (line 208): `className="flex flex-col border-b border-neutral-700 shrink-0"` — does not grow.
3. **Event list scroll container** (line 256-258): `className="flex-1 overflow-y-auto pl-3 pr-2"` — intended to fill remaining space and scroll.

**Finding**: The scroll container (`flex-1 overflow-y-auto`) is a direct child of the root flex-col container. It lacks `min-h-0`, which in CSS flexbox means its minimum height defaults to `min-content`. When expanded payloads grow tall, the flex child won't shrink below its content height, breaking the scroll.
**Location**: `client/src/components/DebugPanel.tsx:256-258`

---

### Parent Layout in App.tsx

**Finding**: DebugPanel is rendered inside a horizontal flex container alongside the chat area and debug toggle handle.
**Location**: `client/src/App.tsx:255`

**Details**:
- Parent flex row (line 255): `style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}`
- DebugPanel is conditionally rendered (line 284): `{isDebugOpen && (<DebugPanel .../>)}`
- The panel root uses `flex-shrink-0` to prevent it from shrinking in the horizontal flex context.

---

### ACTOR_BORDER_COLORS — Already Defined

**Finding**: A mapping of actor types to Tailwind left-border color classes already exists, which the spec needs for the accent border on expanded payloads.
**Location**: `client/src/components/DebugPanel.tsx:14-21`

```ts
const ACTOR_BORDER_COLORS: Record<DebugActor, string> = {
  llm: "border-l-blue-400",
  "mcp-client": "border-l-purple-400",
  "mcp-server": "border-l-green-400",
  oauth: "border-l-orange-400",
  bridge: "border-l-pink-400",
  error: "border-l-red-400",
};
```

**Finding**: `ACTOR_BORDER_COLORS` is currently used only on the entry row itself (line 60, 65: `${borderClass}` in the div className), not on the payload `<pre>`.

---

### DebugEvent Type — Payload Field

**Finding**: `payload` is an optional string on DebugEvent. Entries without a payload have nothing to expand.
**Location**: `client/src/lib/types.ts:34`

```ts
payload?: string;
```

---

### Auto-scroll Logic

**Finding**: Auto-scroll uses a `bottomRef` div at the end of the event list and `scrollIntoView`. A `isUserScrolledUp` ref tracks whether the user has scrolled away from the bottom.
**Location**: `client/src/components/DebugPanel.tsx:119-158`

**Details**:
- Line 119: `scrollContainerRef = useRef<HTMLDivElement>(null)` — the scroll container
- Line 120: `bottomRef = useRef<HTMLDivElement>(null)` — sentinel div at bottom (line 287)
- Line 121: `isUserScrolledUp = useRef(false)` — tracks scroll position
- Lines 144-151: `useEffect` triggers `scrollIntoView` on new events if not scrolled up
- Lines 153-158: `handleScroll` updates `isUserScrolledUp` — threshold is 20px from bottom

---

### Files That Import From or Interact With DebugPanel

**Finding**: Only two files reference DebugPanel:
1. `client/src/App.tsx:19` — imports and renders `DebugPanel`
2. `client/src/components/DebugPanel.test.tsx` — test file

**Finding**: No other components import from DebugPanel. The component is self-contained with no exports other than `DebugPanel` itself.

---

### Files Likely Needing Modification

| File | Reason |
|------|--------|
| `client/src/components/DebugPanel.tsx` | All three spec changes: min-h-0 fix, triangle indicator, payload restyle |

**Finding**: No new files need to be created. All changes are confined to `DebugPanel.tsx`:
1. **Scroll fix**: Add `min-h-0` to the event list scroll container div (line 258).
2. **Triangle indicator**: Add `▶`/`▼` to `EventEntry` based on `expanded` state and presence of `event.payload`.
3. **Payload restyle**: Modify the `<pre>` on lines 86-88 to add max-height + overflow-y-auto, left accent border using existing `ACTOR_BORDER_COLORS`, and distinct background styling.

