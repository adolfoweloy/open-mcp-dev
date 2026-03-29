id: settings__show_tools
overview: >
  Add a "Tools" button to each connected server row in the Settings drawer that opens a modal
  showing the server's tools and resources with search, accordion expand/collapse, and schema
  code blocks. Includes a new backend endpoint to fetch capabilities from the MCP SDK client.
status: planning
acceptance_criteria:
  - "GET /api/mcp/:serverId/capabilities returns tools, resources, and resourcesSupported for a connected server; returns 404 for unknown/disconnected servers, 503 if listTools() fails, and 504 on timeout"
  - "A 'Tools' button appears on each server row in SettingsDrawer only when the server is connected; clicking it opens the ServerCapabilitiesModal"
  - "The modal displays a searchable list of tools (name, description, inputSchema, outputSchema, annotations) with single-item accordion expand/collapse per section"
  - "The Resources section appears only when resourcesSupported is true; each resource expands to show all fields as formatted JSON"
  - "Search input filters tools and resources by name (case-insensitive substring); shows 'No results' when nothing matches"
  - "The Settings drawer does not close when the user clicks the modal overlay; clicking the overlay only closes the modal"
  - "Loading and error states are shown inside the modal content area; the modal remains open on error"
tasks:
  - task: >
      Add `ServerCapabilitiesResponse` type to `shared/types.ts`. Add it after the existing
      `ServerConfigsResponse` type. Definition:

      ```ts
      export interface ServerCapabilitiesResponse {
        tools: Array<{
          name: string;
          description?: string;
          inputSchema: unknown;
          outputSchema?: unknown;
          annotations?: unknown;
        }>;
        resources: Array<{
          uri: string;
          name?: string;
          description?: string;
          mimeType?: string;
          [key: string]: unknown;
        }>;
        resourcesSupported: boolean;
      }
      ```

      The `tools` array items mirror the MCP SDK `Tool` shape (name, description, inputSchema,
      outputSchema, annotations). The `resources` array items use the MCP SDK `Resource` shape
      with an index signature for forward-compatibility.
    refs: [specs/settings/show_tools/requirements.md]
    priority: high
    status: todo

  - task: >
      Add `GET /mcp/:serverId/capabilities` route to `server/routes/mcp-proxy.ts`.
      Add it after the existing `GET /mcp/resource/:serverId` route (around line 50).

      Implementation:
      1. Extract `serverId` from `req.params.serverId`.
      2. Call `mcpManager.getClient(serverId)`. If `undefined`, return `res.status(404).json({ error: "Server not found or not connected" })`.
      3. Create a 5-second timeout helper:
         ```ts
         function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
           return Promise.race([
             promise,
             new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
           ]);
         }
         ```
         Define this as a module-level function at the top of the file (after imports).
      4. Wrap `client.listTools()` in `withTimeout(..., 5000)`. If it throws, check if the error
         message is "Timeout" → return `res.status(504).json({ error: "Request timed out" })`;
         otherwise return `res.status(503).json({ error: "Failed to list tools" })`.
      5. Check `client.getServerCapabilities()?.resources`. If truthy, wrap `client.listResources()`
         in `withTimeout(..., 5000)`. If it times out → return 504. If it throws otherwise →
         still return the tools but with `resources: []` and `resourcesSupported: true` (partial success).
         If not truthy, set `resources: []` and `resourcesSupported: false`.
      6. Return `res.json({ tools: toolsResult.tools, resources: resourcesResult?.resources ?? [], resourcesSupported })`.
      7. Import `ServerCapabilitiesResponse` from `../../shared/types.ts` for documentation (the response
         shape is validated by the type, though Express doesn't enforce it at runtime).

      Follow the error response pattern `{ error: string }` from `server/routes/mcp.ts`.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: high
    status: todo

  - task: >
      Add tests for the capabilities endpoint in `server/routes/mcp-proxy.test.ts`.
      Add a new `describe("GET /mcp/:serverId/capabilities", ...)` block after the existing test blocks.
      Use the existing test patterns: `node:test` + `node:assert/strict`, mock `MCPClientManager` with
      a fake `getClient()` that returns a mock MCP `Client`.

      Test cases:
      1. **Connected server with tools and resources** — mock `getClient()` returning a client where
         `listTools()` resolves `{ tools: [{ name: "tool1", inputSchema: {} }] }`,
         `getServerCapabilities()` returns `{ resources: {} }`,
         `listResources()` resolves `{ resources: [{ uri: "file:///a", name: "A" }] }`.
         Assert response is 200 with `tools.length === 1`, `resources.length === 1`, `resourcesSupported === true`.
      2. **Connected server, no resources capability** — `getServerCapabilities()` returns `{}` (no resources key).
         Assert `resources: []`, `resourcesSupported: false`, and `listResources` was NOT called.
      3. **Unknown server** — `getClient()` returns `undefined`. Assert 404 with `{ error }`.
      4. **listTools() throws** — mock `listTools()` to reject. Assert 503.
      5. **Timeout** — mock `listTools()` to never resolve (return a pending promise). Assert 504
         (use a shorter timeout in the test or mock setTimeout). Note: this test may need the
         `withTimeout` function's delay to be configurable or use fake timers.
      6. **listResources() throws but listTools() succeeds** — Assert 200 with tools populated,
         `resources: []`, `resourcesSupported: true`.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: high
    status: todo

  - task: >
      Add `fetchServerCapabilities` function to `client/src/lib/api.ts`.
      Add it after the existing `fetchOAuthAuthUrl` function (around line 63).

      ```ts
      export async function fetchServerCapabilities(
        serverId: string
      ): Promise<ServerCapabilitiesResponse> {
        const res = await fetch(
          `/api/mcp/${encodeURIComponent(serverId)}/capabilities`
        );
        await checkResponse(res);
        return res.json() as Promise<ServerCapabilitiesResponse>;
      }
      ```

      Import `ServerCapabilitiesResponse` from `../../../shared/types` (follow the existing import
      path pattern used for other shared types in this file — check the actual import path at the
      top of `api.ts` and match it).
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: high
    status: todo

  - task: >
      Create `client/src/components/ServerCapabilitiesModal.tsx` — the standalone modal component.

      **Props interface:**
      ```ts
      interface ServerCapabilitiesModalProps {
        serverId: string;
        onClose: () => void;
      }
      ```

      **Component structure:**
      1. **State**: `data: ServerCapabilitiesResponse | null`, `error: string | null`,
         `loading: boolean` (init `true`), `search: string` (init `""`),
         `expandedTool: string | null`, `expandedResource: string | null`.
      2. **Fetch on mount**: `useEffect` with `fetchServerCapabilities(serverId)` — on success set
         `data` and `loading: false`; on error set `error: e.message` and `loading: false`.
      3. **Portal**: render via `ReactDOM.createPortal(..., document.body)`.
      4. **Overlay**: `<div>` with `position: fixed; inset: 0; zIndex: 2000; background: rgba(0,0,0,0.4)`
         (same as `ServerFormModal.tsx:19-29`). `onMouseDown` closes modal only when
         `e.target === e.currentTarget`. Also add `e.stopPropagation()` on the overlay's `onMouseDown`
         to prevent the SettingsDrawer's document-level mousedown listener from firing.
      5. **Modal panel**: centered `<div>` with `role="dialog"`, `aria-modal="true"`, max-width `640px`,
         max-height `80vh`, `overflow-y: auto`, white background (dark: neutral-900), rounded corners,
         padding. Tailwind classes matching the style of `ServerFormModal`.
      6. **Header**: flex row with server ID as title (`<h2>` with `text-lg font-semibold`) and a close
         button (`<button onClick={onClose} aria-label="Close">✕</button>`).
      7. **Search input**: `<input type="text" placeholder="Search tools and resources..."
         value={search} onChange={e => setSearch(e.target.value)} />` with Tailwind classes for
         a text input (border, rounded, padding, full width, `mb-4`).
      8. **Loading state**: when `loading` is true, show `<div className="text-center text-neutral-500 py-8">Loading…</div>`.
      9. **Error state**: when `error` is non-null, show `<div className="text-center text-red-500 py-8">{error}</div>`.
      10. **Content** (when `data` is non-null and not loading):
          - Filter tools: `data.tools.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))`.
          - Filter resources: `data.resources.filter(r => (r.name || r.uri).toLowerCase().includes(search.toLowerCase()))`.
          - Render Tools section and Resources section (described in next tasks).

      **Formatting helper** — reuse `serializePayload` from `client/src/lib/types.ts` for all
      JSON code blocks (it handles truncation at 10240 chars).

      Export the component as a named export: `export function ServerCapabilitiesModal(...)`.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md, specs/architecture.md]
    priority: medium
    status: todo

  - task: >
      Implement the Tools section inside `ServerCapabilitiesModal.tsx`.

      Render below the search input. Structure:
      1. `<h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">Tools</h3>`
         — always rendered.
      2. If `filteredTools.length === 0` and `search` is non-empty: `<p className="text-neutral-500 text-sm mb-4">No results</p>`.
      3. If `filteredTools.length === 0` and `search` is empty: `<p className="text-neutral-500 text-sm mb-4">No tools available</p>`.
      4. For each tool in `filteredTools`, render an accordion item:
         - Collapsed: `<button onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)} aria-expanded={expandedTool === tool.name}>`
           showing `tool.name` and a `▶`/`▼` indicator (▶ when collapsed, ▼ when expanded).
           Style: `w-full text-left px-3 py-2 hover:bg-neutral-800/50 rounded cursor-pointer flex items-center justify-between`.
         - Expanded (when `expandedTool === tool.name`): a `<div className="px-3 pb-3">` containing:
           a. If `tool.description`: `<p className="text-sm text-neutral-300 mb-2">{tool.description}</p>`.
           b. Always: label `<span className="text-xs text-neutral-500 uppercase">Input Schema</span>` then
              `<pre className="mt-1 text-xs text-neutral-200 whitespace-pre-wrap break-all bg-neutral-950 p-2 rounded font-mono max-h-64 overflow-y-auto">{serializePayload(tool.inputSchema)}</pre>`.
           c. If `tool.outputSchema`: same pattern with label "Output Schema".
           d. If `tool.annotations`: same pattern with label "Annotations".
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: medium
    status: todo

  - task: >
      Implement the Resources section inside `ServerCapabilitiesModal.tsx`.

      Render below the Tools section. Structure:
      1. Only render the entire section if `data.resourcesSupported === true`. If false, render nothing.
      2. `<h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2 mt-6">Resources</h3>`.
      3. If `filteredResources.length === 0` and `search` is non-empty: `<p className="text-neutral-500 text-sm mb-4">No results</p>`.
      4. If `filteredResources.length === 0` and `search` is empty: `<p className="text-neutral-500 text-sm mb-4">No resources available</p>`.
      5. For each resource in `filteredResources`, render an accordion item:
         - Collapsed: button showing `resource.name || resource.uri` with `▶`/`▼` indicator.
           Same style as tool accordion items.
           `onClick={() => setExpandedResource(expandedResource === resource.uri ? null : resource.uri)}`.
         - Expanded (when `expandedResource === resource.uri`): a `<div>` containing
           `<pre>` with `serializePayload(resource)` showing all resource fields as formatted JSON.
           Same `<pre>` styling as tool schemas.
      6. Accordion behavior is independent from the Tools section — expanding a resource does NOT
         collapse an expanded tool, and vice versa.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: medium
    status: todo

  - task: >
      Add the "Tools" button and modal state management to `client/src/components/SettingsDrawer.tsx`.

      **In the `ServerRow` component** (around line 106):
      1. Add a new prop `onTools: () => void` to the `ServerRow` internal props.
      2. In the button area (after the Edit button, around line 210), add a "Tools" button that is
         only rendered when `isConnected` (the existing boolean at line 148):
         ```tsx
         {isConnected && (
           <button
             onClick={onTools}
             className="text-xs text-blue-400 hover:text-blue-300"
           >
             Tools
           </button>
         )}
         ```
         Use the same text-button style as the existing Edit and Delete buttons.

      **In the `SettingsDrawer` component** (around line 234):
      1. Add state: `const [toolsServerId, setToolsServerId] = useState<string | null>(null);`
      2. Pass `onTools={() => setToolsServerId(id)}` to each `ServerRow` instance (around line 376-386).
      3. At the end of the SettingsDrawer return (inside the portal, after the drawer panel),
         conditionally render:
         ```tsx
         {toolsServerId && (
           <ServerCapabilitiesModal
             serverId={toolsServerId}
             onClose={() => setToolsServerId(null)}
           />
         )}
         ```
      4. Import `ServerCapabilitiesModal` from `./ServerCapabilitiesModal`.

      **Outside-click suppression**: The `ServerCapabilitiesModal` overlay calls `e.stopPropagation()`
      on `onMouseDown`, which prevents the event from reaching the `document` listener in SettingsDrawer.
      This is sufficient — no additional flag needed in the drawer's mousedown handler.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md, specs/architecture.md]
    priority: medium
    status: todo

  - task: >
      Add tests for `ServerCapabilitiesModal` in `client/src/components/ServerCapabilitiesModal.test.tsx`.
      Use vitest + `@testing-library/react` (same as `ServerFormModal.test.tsx`).

      Mock `fetchServerCapabilities` from `../lib/api` using `vi.mock`.

      Test cases:
      1. **Loading state** — render modal, assert "Loading" text is visible before fetch resolves.
      2. **Displays tools** — mock fetch resolving with `{ tools: [{ name: "my-tool", description: "A tool", inputSchema: { type: "object" } }], resources: [], resourcesSupported: false }`.
         Assert "my-tool" is visible. Assert "Resources" section heading is NOT in the document
         (since `resourcesSupported` is false).
      3. **Expand tool accordion** — click on "my-tool" row. Assert description "A tool" is visible.
         Assert input schema `<pre>` block contains `"type": "object"`. Click again to collapse —
         assert description is no longer visible.
      4. **Search filters tools** — mock with two tools `["alpha", "beta"]`. Type "alp" in search input.
         Assert "alpha" visible, "beta" not visible. Clear search — both visible again.
      5. **Search no results** — type "zzz" in search. Assert "No results" message visible.
      6. **Resources section shown when supported** — mock with `resourcesSupported: true` and one
         resource `{ uri: "file:///x", name: "X" }`. Assert "Resources" heading visible. Click on "X"
         — assert `<pre>` block with resource JSON is visible.
      7. **Error state** — mock fetch rejecting with `new Error("HTTP 503: Failed")`. Assert error
         message "HTTP 503: Failed" is visible in the modal.
      8. **Close on overlay click** — render modal, fire mouseDown on overlay element, assert `onClose`
         callback was called.
      9. **Close button** — click the close button, assert `onClose` was called.
      10. **Single accordion** — expand "alpha", then click "beta". Assert "alpha" content is hidden
          and "beta" content is visible (only one expanded at a time).
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: medium
    status: todo

  - task: >
      Add tests for the Tools button in `client/src/components/SettingsDrawer.test.tsx`.
      Add a new `describe("Tools button", ...)` block.

      Test cases:
      1. **Tools button visible when connected** — render SettingsDrawer with a server that has
         `status.connected === true`. Assert a "Tools" button is present in the server row.
      2. **Tools button hidden when disconnected** — render with `status.connected === false`.
         Assert no "Tools" button is present.
      3. **Clicking Tools button opens modal** — click the "Tools" button. Assert that
         `ServerCapabilitiesModal` is rendered (check for the modal's `role="dialog"` element
         or a known text like "Loading" or the server ID in the header).
      4. **Modal closes and state resets** — open the modal, then simulate close (click close button).
         Assert modal is no longer in the DOM.

      Mock `fetchServerCapabilities` to avoid real network calls in these tests.
    refs: [specs/settings/show_tools/requirements.md, specs/settings/show_tools/research.md]
    priority: low
    status: todo
