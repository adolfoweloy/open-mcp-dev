# Bug: Toggling a connected MCP server checkbox has no visible effect

## Description
In the server sidebar, checking/unchecking a connected MCP server's checkbox appears to
do nothing — the checkbox state does not update in the UI even though the `onChange`
handler fires and calls `onToggle`.

## Symptoms
- A connected (green) server is shown with a checked checkbox.
- Clicking the checkbox triggers the `onChange`, but the checkbox remains checked.
- No visual feedback that the toggle was registered.

## Reproduction Steps
1. Load the app with at least one connected MCP server.
2. In the left sidebar under "MCP Servers", click the checkbox next to a connected server.
3. Observe that the checkbox does not uncheck.

## Expected Behaviour
Clicking the checkbox toggles it and updates `enabledServers` on the active conversation
so subsequent sends respect the new selection.

## Actual Behaviour
The `handleToggleServer` in `App.tsx` fires and calls `setConversations` with the updated
`enabledServers` array, but the checkbox re-renders as checked (state update is either not
propagating to the component or is being overwritten on re-render).

## Area Affected
`client/src/App.tsx` — `handleToggleServer` / `enabledServers` derivation.
`client/src/components/ServerSidebar.tsx` — checkbox `checked` binding.
