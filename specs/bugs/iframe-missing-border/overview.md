# Bug: MCP resource iframe has no visible border

## Description
The `McpResourceFrame` component renders an MCP UI widget inside an `<iframe>` with
`border: "none"` and no border on its container. The widget blends seamlessly into the
chat area, making its boundaries unclear.

## Symptoms
- The iframe area has no visible edge, making it impossible to tell where the chat ends
  and the widget begins.

## Reproduction Steps
1. Open a conversation with an MCP server that serves a UI resource.
2. Trigger a tool call that renders a `McpResourceFrame`.
3. Observe that the widget has no visible border distinguishing it from surrounding content.

## Expected Behaviour
A thin, light border (e.g. 1px solid with a neutral/muted colour) wraps the iframe
container so the widget boundaries are clear.

## Actual Behaviour
The inline-mode container div has no border; the `<iframe>` element itself has
`border: "none"` applied.

## Area Affected
`client/src/components/McpResourceFrame.tsx` — the inline-mode wrapper `<div>` and the
`<iframe>` element styling.
