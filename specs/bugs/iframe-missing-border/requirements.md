# Fix Requirements

## Acceptance Criteria
- The inline-mode wrapper div around the iframe has a visible border (1px, rounded,
  muted/neutral colour consistent with the dark chat theme).
- The border appears for all MCP resource frames rendered in inline mode.
- The fullscreen overlay mode does NOT show this border (full-screen covers the viewport).
- The iframe `border: "none"` inline style is preserved (border is on the container, not
  the iframe element itself).

## Non-Goals
- Changing the iframe dimensions, height animation, or fullscreen behaviour.
- Adding a header/title bar to the iframe container.
