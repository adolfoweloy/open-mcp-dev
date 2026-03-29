id: bugs__iframe-missing-border
overview: Add a visible border to the inline-mode MCP resource iframe container so widget boundaries are distinguishable from surrounding chat content
status: done
acceptance_criteria:

  - The inline-mode wrapper div around the iframe displays a 1px solid border with a muted/neutral colour (e.g. rgba(255,255,255,0.15) or similar dark-theme-appropriate tone) and rounded corners (e.g. 8px border-radius)
  - Every McpResourceFrame rendered in inline mode shows the border regardless of content or height
  - The fullscreen overlay mode does NOT display this border
  - The iframe element itself retains its existing border none inline style
tasks:
  - task: >
      Add a visible border to the inline-mode wrapper div in
      client/src/components/McpResourceFrame.tsx at line 212. Modify the existing
      inline style object on the wrapper div (the one with position relative,
      width 100%, height ...) to include two new properties:
        border: "1px solid rgba(255, 255, 255, 0.15)"
        borderRadius: "8px"
      Also add overflow: "hidden" so the iframe content is clipped to the rounded corners.
      Do NOT modify the fullscreen overlay div (lines 191-208) or the iframe element's
      border none style (line 184). The styling pattern is inline React style objects
      — no CSS classes or external imports should be added.
    refs:
      - specs/bugs/iframe-missing-border/requirements.md
      - specs/bugs/iframe-missing-border/research.md
    priority: high
    status: done
  - task: >
      Manually verify the border fix by testing both display modes:
      1. Trigger an MCP tool call that renders a McpResourceFrame in inline mode — confirm
         a thin rounded border is visible around the iframe container and content is clipped
         to the rounded corners.
      2. Click the fullscreen toggle — confirm the fullscreen overlay does NOT show the new
         border.
      3. Trigger multiple McpResourceFrame renders in a single conversation — confirm every
         inline instance shows the border.
      4. Inspect the iframe element in devtools — confirm it still has border none.
      There are no existing automated tests for McpResourceFrame styling. Given this is a
      single CSS property addition with no logic change, manual verification is sufficient.
    refs:
      - specs/bugs/iframe-missing-border/requirements.md
    priority: high
    status: done
