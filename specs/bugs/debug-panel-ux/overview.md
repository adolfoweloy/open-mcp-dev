# Bug: Debug panel scroll breaks on expand and log styling is poor

## Description
Two related UX defects in the debug panel:

1. **Scroll breakage**: Expanding a log entry to view its payload causes the entire debug
   panel to stop scrolling. The outer container cannot scroll through the expanded content.

2. **Styling**: Log entries use raw `<pre>` blocks with no clear expand/collapse affordance.
   There is no indicator that an entry has expandable detail. The payload content lacks
   terminal/code-block styling.

## Symptoms
- After clicking a log entry to expand its JSON payload, the scroll container freezes and
  the expanded content may be partially or fully hidden below the visible area.
- Log entries give no visual hint that they are clickable/expandable.
- Expanded payloads render as plain grey text in a dim `<pre>` with no syntax distinction.

## Reproduction Steps
1. Open the debug panel (click the "debug" handle on the right).
2. Perform any MCP tool call to populate log entries.
3. Click a log entry that has a payload (e.g., a tool-call or tool-result event).
4. Observe that the expanded content clips/overflows and the panel can no longer be
   scrolled to see it.
5. Also note the lack of expand/collapse arrow on the entry row.

## Expected Behaviour
- **Scroll**: Expanding entries makes the scroll area taller; the user can scroll down
  to see the expanded payload without the container locking up.
- **Expand indicator**: Each entry that has a payload shows a right-pointing triangle (▶)
  that rotates to down-pointing (▼) when expanded.
- **Payload styling**: Expanded payloads render in a terminal/code-block style — monospace
  font, distinct dark background, subtle border or left accent, JSON formatted.

## Actual Behaviour
- The debug panel root has `overflow-hidden` with no explicit height, and the inner scroll
  container's `flex-1 overflow-y-auto` has no `min-height: 0`, causing flex overflow issues
  when entries grow.
- `EventEntry` has no indicator; the whole row is clickable but gives no affordance hint.
- Expanded payload uses `<pre className="... bg-neutral-900 p-2 rounded">` with no distinct
  code styling.

## Area Affected
`client/src/components/DebugPanel.tsx` — `EventEntry` component and the event list container.
