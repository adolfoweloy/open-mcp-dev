# Research: settings/show_tools

**Tier**: medium
**Generated**: 2026-03-29 21:33

---

# File Mapping

Now let me check the existing client types and the directory structures.Now let me check the server entry point to understand how routes are registered.Now let me check the server index to see how all routes are mounted and also look at the spec.Now let me check the existing test patterns for the mcp-proxy routes and the SettingsDrawer.Now let me check the App component to understand how SettingsDrawer is used and how the ServerFormModal is triggered.Now I have all the information needed. Here is my research output:

## File Mapping

### Files to Modify

**Finding**: Backend route file where the new `GET /api/mcp/:serverId/capabilities` endpoint will be added.
**Location**: `server/routes/mcp-proxy.ts:1-78`
**Details**: Currently has two routes (`POST /mcp/tool/:serverId` and `GET /mcp/resource/:serverId`). The new capabilities route follows the same pattern: extract `serverId` from params, get client via `mcpManager.getClient(serverId)`, call SDK methods, return JSON. Router is created via `createMcpProxyRouter(mcpManager)` and receives only the `MCPClientManager` instance (no `config`).

**Finding**: Shared types file where `ServerCapabilitiesResponse` will be added.
**Location**: `shared/types.ts:1-98`
**Details**: Contains all shared request/response types (`McpServerConfig`, `McpServerStatus`, `ScrubbedMcpServerConfig`, `ServerConfigsResponse`, `AddServerRequest`, `UpdateServerRequest`, `ChatRequest`, `StreamDebugEvent`). New type goes here.

**Finding**: Client API module where `fetchServerCapabilities()` will be added.
**Location**: `client/src/lib/api.ts:1-103`
**Details**: All API functions follow the same pattern: `fetch(url)` → `checkResponse(res)` → `res.json() as Promise<T>`. The `startOAuthConnect` and `fetchOAuthAuthUrl` functions at lines 45-63 demonstrate the `encodeURIComponent(serverId)` URL pattern already used for parameterized MCP routes.

**Finding**: SettingsDrawer component where the "Tools" button will be added to `ServerRow`.
**Location**: `client/src/components/SettingsDrawer.tsx:106-234` (ServerRow component)
**Details**: `ServerRow` receives `{ id, config, status, onEdit, onDelete, onRefresh }`. The button area is at lines 180-226, containing Disconnect/Connect/Reconnect, Edit, and Delete buttons. The new "Tools" button should be conditionally rendered when `isConnected` (line 148). The `ServerRow` component is internal to this file (not exported). The `SettingsDrawer` (parent) renders `ServerRow` at lines 376-386, passing props from the `statusById` map.

**Finding**: SettingsDrawer drawer uses outside-click handler that needs to be suppressed when the capabilities modal is open.
**Location**: `client/src/components/SettingsDrawer.tsx:264-273`
**Details**: The `handleMouseDown` listener on `document` checks if the click is outside `drawerRef.current`. When the new modal is open (portaled to `document.body`), clicks on the modal overlay would trigger this handler and close the drawer. A flag or stopPropagation approach is needed.

### Files to Create

**Finding**: New standalone modal component for server capabilities.
**Location**: `client/src/components/ServerCapabilitiesModal.tsx` (to be created)
**Details**: Per the spec's non-functional requirements: "New modal is a standalone component (`ServerCapabilitiesModal`); not embedded in `SettingsDrawer`." The naming follows existing convention: `ServerFormModal.tsx` for the form modal. The component directory contains all components as flat `.tsx` files (no subdirectories).

**Finding**: Test file for the new modal component.
**Location**: `client/src/components/ServerCapabilitiesModal.test.tsx` (to be created)
**Details**: Every existing component has a co-located `.test.tsx` file (e.g., `ServerFormModal.test.tsx`, `SettingsDrawer.test.tsx`). Client tests use vitest + `@testing-library/react`.

**Finding**: Test file for the new backend endpoint.
**Location**: `server/routes/mcp-proxy.test.ts` (modify existing)
**Details**: The existing test file at `server/routes/mcp-proxy.test.ts` already tests the proxy router. New test cases for the capabilities endpoint should be added here. Server tests use `node:test` + `node:assert/strict` (different from client's vitest).

### Relevant Existing Files (Purpose Summary)

| File | Purpose |
|------|---------|
| `server/routes/mcp-proxy.ts` | Express router for MCP tool calls and resource reads — new endpoint goes here |
| `server/routes/mcp-proxy.test.ts` | Tests for mcp-proxy router — add capabilities tests here |
| `server/routes/mcp.ts` | Express router for server status, connect/disconnect — reference for route patterns |
| `server/lib/mcp-manager.ts` | `MCPClientManager` class — `getClient()` returns MCP SDK `Client` for `listTools()`/`listResources()`/`getServerCapabilities()` |
| `server/index.ts` | App setup — mounts `createMcpProxyRouter(mcpManager)` at `/api` (line 31); no changes needed |
| `shared/types.ts` | Shared types between server and client — add `ServerCapabilitiesResponse` |
| `client/src/lib/api.ts` | Client-side API functions — add `fetchServerCapabilities()` |
| `client/src/lib/types.ts` | Client-side type re-exports from shared — may need to re-export new type |
| `client/src/components/SettingsDrawer.tsx` | Settings drawer with `ServerRow` — add Tools button, manage modal open state |
| `client/src/components/SettingsDrawer.test.tsx` | Tests for SettingsDrawer — add tests for Tools button visibility/click |
| `client/src/components/ServerFormModal.tsx` | Existing modal — reference for portal pattern, overlay/modal styles, z-index 2000 |
| `client/src/components/ServerFormModal.test.tsx` | Tests for ServerFormModal — reference for modal test patterns |
| `client/src/App.tsx` | Root component — renders SettingsDrawer and ServerFormModal; may NOT need changes if modal is managed within SettingsDrawer |

### Directory Structure & Naming Conventions

**Finding**: Client components are flat `.tsx` files in `client/src/components/` with co-located `.test.tsx` files.
**Location**: `client/src/components/`
**Details**: No subdirectories. Components are PascalCase named exports (e.g., `export function ServerFormModal`). File names match component names.

**Finding**: Server routes are flat `.ts` files in `server/routes/` with co-located `.test.ts` files.
**Location**: `server/routes/`
**Details**: Each route module exports a `create*Router(...)` factory function. Tests use `node:test` framework.

**Finding**: Shared types are in a single `shared/types.ts` file.
**Location**: `shared/types.ts`
**Details**: All interfaces and types live in one file. No subdirectory structure.

### Key MCPClientManager Methods for the New Endpoint

**Finding**: `getClient(id)` returns `Client | undefined` — the MCP SDK client instance.
**Location**: `server/lib/mcp-manager.ts:622-624`
**Details**: Returns `undefined` if server is not connected. The `Client` type comes from `@modelcontextprotocol/sdk/client/index.js`.

**Finding**: `client.listTools()` is already used in `getToolsForAiSdk()`.
**Location**: `server/lib/mcp-manager.ts:640-641`
**Details**: Returns `{ tools: Tool[] }`. Each tool has `name`, `description?`, `inputSchema`, `outputSchema?`, `annotations?`, `_meta?`.

**Finding**: The MCP SDK `Client` has `getServerCapabilities()` method (not used yet in the codebase).
**Location**: Not yet called in this codebase; part of `@modelcontextprotocol/sdk/client/index.js` API.
**Details**: Returns the server's capabilities object from the initial handshake. The `resources` capability indicates if `listResources()` is supported.

**Finding**: `client.listResources()` is not yet called anywhere in the codebase.
**Location**: N/A (new usage)
**Details**: Part of MCP SDK Client API. Must be capability-gated: only call if `client.getServerCapabilities()?.resources` is truthy.

### Modal State Management Pattern

**Finding**: `ServerFormModal` is managed from `App.tsx` via state (`formMode`, `editServerId`).
**Location**: `client/src/App.tsx:238-247`
**Details**: App passes `onRequestEditServer` callback down to SettingsDrawer, which calls it from ServerRow. However, the spec says the new modal is "not embedded in SettingsDrawer" but is a standalone component. The modal could be managed locally within SettingsDrawer (simpler, since the Tools button is in ServerRow which is inside SettingsDrawer) or lifted to App.tsx. The spec's "standalone component" phrasing likely means it's its own file, not necessarily lifted to App.

**Finding**: SettingsDrawer is a fully self-contained portal.
**Location**: `client/src/components/SettingsDrawer.tsx:294-394`
**Details**: It portals to `document.body` at z-index 1000/1001. The new modal at z-index 2000 would render on top. State for `isToolsModalOpen` and `toolsServerId` can live inside SettingsDrawer, with the `ServerCapabilitiesModal` component rendered conditionally from within SettingsDrawer's return.

---

# Pattern Analysis

I'll research the specific patterns requested. Let me start by finding the relevant files.Now let me check for accordion/expand-collapse patterns and serializePayload.Now let me read the expand/collapse patterns in ToolCallResult and DebugPanel.Now let me check the outside-click suppression mechanism more closely — how the drawer and modal interact.Now let me check how the drawer's outside-click interacts with the modal — specifically, the `onMouseDown` on the overlay in ServerFormModal vs the `mousedown` listener in SettingsDrawer.Now let me check for the `listResources` and `listTools` patterns in the MCP client to understand the API call pattern.Now let me check the structure of the MCP Client to understand its capabilities property.Let me check what Client exposes for capabilities/server info.Now let me check existing routes to understand the pattern for new API endpoints.Now I have all the information needed. Let me compile the findings.

## Pattern Analysis

### 1. Modal Portal + Z-Index Pattern (ServerFormModal)

**Finding**: Modals are rendered via `ReactDOM.createPortal` into `document.body`. The overlay uses `position: fixed; inset: 0; zIndex: 2000` with a semi-transparent background. The modal content sits centered inside using flexbox.

**Location**: `client/src/components/ServerFormModal.tsx:19-29` (overlay), `:31-43` (modal box), `:501` (portal call)

**Details — overlay style**:
```tsx
function overlayStyle(): React.CSSProperties {
  return {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}
```

**Details — portal rendering**:
```tsx
return ReactDOM.createPortal(modal, document.body);
```

**Details — outside-click on overlay**: The overlay `div` has `onMouseDown` that calls `onClose()` only when clicking the overlay itself (not children):
```tsx
<div style={overlayStyle()} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
```
**Location**: `client/src/components/ServerFormModal.tsx:205`

### 2. Drawer Z-Index and Outside-Click Suppression

**Finding**: The SettingsDrawer renders at `zIndex: 1000` (backdrop) and `zIndex: 1001` (drawer panel). It uses a `document.addEventListener("mousedown", ...)` listener that closes the drawer when clicking outside `drawerRef.current`.

**Location**: `client/src/components/SettingsDrawer.tsx:296-299` (backdrop z-index), `:306-318` (drawer panel z-index 1001), `:264-273` (outside-click listener)

**Details — outside-click listener**:
```tsx
useEffect(() => {
  if (!isOpen) return;
  function handleMouseDown(e: MouseEvent) {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      onClose();
    }
  }
  document.addEventListener("mousedown", handleMouseDown);
  return () => document.removeEventListener("mousedown", handleMouseDown);
}, [isOpen, onClose]);
```

**Finding — Suppression mechanism**: Currently there is **no** explicit suppression mechanism between the drawer and ServerFormModal. When ServerFormModal is open, the drawer's mousedown listener fires on clicks to the modal overlay (which is outside the drawer). However, because the `formMode` state gates the modal rendering in `App.tsx:238`, and `handleFormClose` (called via `onClose`/`onSaved`) only sets `formMode=null` — the drawer stays open independently. The current approach relies on the fact that clicking the modal overlay triggers `e.target === e.currentTarget` (the overlay div), which will also satisfy the drawer's "outside click" check. **There is no `stopPropagation` or ref-exclusion logic** preventing the drawer from closing when a user clicks the modal's overlay.

**Location**: `client/src/App.tsx:230-247` (drawer + modal coexistence), `:182-185` (handleFormClose)

**Finding — Current interaction bug/behavior**: When clicking the ServerFormModal's darkened overlay (to close the modal), the drawer's outside-click listener also fires because the modal overlay is not inside `drawerRef.current`. This means clicking the modal's backdrop closes both the modal AND the drawer simultaneously. The new ToolsModal implementation will need to address this by suppressing the drawer's outside-click while the modal is open.

### 3. Accordion / Expand-Collapse Patterns

**Finding (ToolCallResult)**: Simple toggle using `useState(false)` with a button that flips the boolean. Uses `▲`/`▼` indicators. Conditionally renders expanded content with `{expanded && (...)}`.

**Location**: `client/src/components/ToolCallResult.tsx:17-41`

**Details**:
```tsx
const [expanded, setExpanded] = useState(false);
// ...
<button onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
  <span>{formatToolName(toolName)}</span>
  <span>{expanded ? "▲" : "▼"}</span>
</button>
{expanded && (
  <div>
    <pre>{JSON.stringify(args, null, 2)}</pre>
    // ...
  </div>
)}
```

**Finding (DebugPanel EventEntry)**: More complex expand/collapse with `▶`/`▼` indicators (right-pointing triangle when collapsed). Uses `cursor-pointer` and `hover:bg-neutral-800/50` only when payload exists. Has a scroll-into-view mechanism after expanding. Payload is formatted JSON in a `<pre>` block with Tailwind classes.

**Location**: `client/src/components/DebugPanel.tsx:65-136`

**Details — collapsed/expanded indicators**:
```tsx
{hasPayload ? (
  <span className="text-neutral-500 text-[10px] mr-1 inline-block w-3 shrink-0">
    {expanded ? "▼" : "▶"}
  </span>
) : (
  <span className="inline-block w-3 mr-1 shrink-0" />
)}
```

**Details — expanded payload rendering**:
```tsx
{expanded && event.payload && (
  <pre className="mt-1 ml-2 text-[10px] text-neutral-200 whitespace-pre-wrap break-all bg-neutral-950 p-2 rounded max-h-64 overflow-y-auto font-mono border-l-2 ...">
    {formatPayload(event.payload)}
  </pre>
)}
```

**Finding**: There is **no shared accordion/disclosure component** in the codebase. Each component implements its own expand/collapse via local `useState(false)`.

### 4. `serializePayload` Truncation Pattern

**Finding**: `serializePayload` exists in three locations with identical implementations. It converts unknown data to pretty-printed JSON and truncates at 10,240 characters with a `\n[TRUNCATED]` suffix.

**Location (server)**: `server/lib/mcp-manager.ts:12-22`, `server/routes/chat.ts:10-18`
**Location (client)**: `client/src/lib/types.ts:40-50`

**Details — implementation**:
```ts
export function serializePayload(data: unknown): string {
  if (data === undefined || data === null) return "";
  let raw: string;
  try {
    raw = JSON.stringify(data, null, 2) ?? "";
  } catch {
    return "";
  }
  if (raw.length > 10_240) return raw.slice(0, 10_240) + "\n[TRUNCATED]";
  return raw;
}
```

**Finding (tests)**: The client-side `serializePayload` has tests verifying: normal objects, truncation at 10240 chars with `\n[TRUNCATED]` suffix, undefined/null return `""`, circular references return `""`, numbers, strings, and arrays.

**Location**: `client/src/lib/types.test.ts:2-48`

### 5. `checkResponse` API Call Pattern

**Finding**: `checkResponse` is a private helper in `client/src/lib/api.ts` that validates HTTP responses. It checks `res.ok`, and if false, reads the response body as text and throws an `Error` with the format `HTTP ${status}: ${body}`.

**Location**: `client/src/lib/api.ts:7-13`

**Details**:
```ts
async function checkResponse(res: Response): Promise<Response> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res;
}
```

**Finding — Usage pattern**: Every API function follows the same pattern:
1. `const res = await fetch(url, options);`
2. `await checkResponse(res);`
3. `return res.json() as Promise<Type>;` (for GET/data-returning calls) or just return void

**Location**: `client/src/lib/api.ts:15-102` (all 8 exported functions follow this pattern)

**Finding — URL encoding pattern**: Server IDs in URL paths are encoded with `encodeURIComponent`:
```ts
const res = await fetch(`/api/mcp/${encodeURIComponent(serverId)}/connect`, { method: "POST" });
```
**Location**: `client/src/lib/api.ts:48`, `:88`, `:98`

### 6. Server Route Pattern (for new capabilities endpoint)

**Finding**: MCP routes are defined in `server/routes/mcp.ts` using Express Router. The router factory receives `config: Config` and `mcpManager: MCPClientManager`. Routes use `req.params` for URL parameters and follow a pattern of checking server existence via `config.mcp_servers[serverId]`, checking connection via `mcpManager.isConnected()`, then calling manager methods.

**Location**: `server/routes/mcp.ts:1-100`

**Details — error response pattern**: 404 for unknown servers, 500 for internal errors. Error responses use `{ error: string }` shape.

**Finding**: The `mcpManager.getClient(id)` method returns the raw MCP `Client` instance which has `listTools()` available. The `Client` is from `@modelcontextprotocol/sdk/client/index.js`.

**Location**: `server/lib/mcp-manager.ts:622-624` (getClient), `:2` (Client import), `:640` (listTools usage)

### 7. DebugPanel `formatPayload` Pattern

**Finding**: DebugPanel has a `formatPayload` helper that attempts to parse JSON and re-stringify with indentation, falling back to the raw string if parsing fails.

**Location**: `client/src/components/DebugPanel.tsx:57-63`

**Details**:
```ts
function formatPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}
```

