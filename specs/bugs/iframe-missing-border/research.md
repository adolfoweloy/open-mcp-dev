# Research: bugs/iframe-missing-border

**Tier**: light
**Generated**: 2026-03-29 16:12

---

# File Mapping

## File Mapping

### Primary File to Modify

**Finding**: `McpResourceFrame.tsx` is the single file that needs modification. It contains both the inline-mode wrapper div and the fullscreen overlay div, with all styles applied inline.

**Location**: `client/src/components/McpResourceFrame.tsx`

### Inline-Mode Wrapper Div

**Finding**: The inline-mode wrapper div is at lines 212–220. It uses inline styles with `position: relative`, `width: 100%`, dynamic height, and a height transition. **No border is currently applied.**

**Location**: `client/src/components/McpResourceFrame.tsx:212`
```tsx
<div style={{ position: "relative", width: "100%", height: `${iframeHeight}px`, transition: "height 300ms ease-out" }}>
```

### Fullscreen Overlay Div

**Finding**: The fullscreen overlay div is at lines 191–208. It uses `position: fixed` with full viewport dimensions and `zIndex: 9999`. It has `background: "white"` but **no border**. The spec says NOT to add a border here.

**Location**: `client/src/components/McpResourceFrame.tsx:191-208`

### Iframe Element

**Finding**: The iframe element is defined once at lines 178–187 and reused in both modes. It already has `border: "none"` in its inline styles. The spec says to preserve this.

**Location**: `client/src/components/McpResourceFrame.tsx:184`
```tsx
style={{ width: "100%", height: "100%", border: "none", display: "block" }}
```

### Fullscreen Toggle Mechanism

**Finding**: Display mode is toggled via the `isFullscreen` boolean state (line 30). When `true`, the fullscreen overlay div renders (line 189). When `false`, the inline wrapper div renders (lines 211–221). This is a simple conditional return — the border should only be added to the `else` branch (inline mode).

**Location**: `client/src/components/McpResourceFrame.tsx:30` (state), `client/src/components/McpResourceFrame.tsx:189` (branch)

### Styling Pattern

**Finding**: All styles in this component are applied as inline React `style` objects — there are no CSS modules, styled-components, or external stylesheet imports. No CSS class names are used.

**Location**: `client/src/components/McpResourceFrame.tsx:1` (imports show only React, no CSS imports)

### No Existing Border/Theme Tokens

**Finding**: The component does not import any theme tokens, CSS variables, or design system utilities. The fullscreen overlay uses a hardcoded `background: "white"`. For a "muted border" color, there is no existing pattern in this file to follow.

**Location**: `client/src/components/McpResourceFrame.tsx` (entire file — no theme imports)

### Files Summary

| File | Purpose | Action Needed |
|------|---------|---------------|
| `client/src/components/McpResourceFrame.tsx` | Renders iframe wrapper in inline and fullscreen modes | Add border + border-radius to inline wrapper div (line 212) |

No new files need to be created. This is a single-line style change in one file.

