# Fix Requirements

## Acceptance Criteria
- While messages are streaming, if the user has not scrolled the message list, the view
  auto-follows the tail (current behaviour preserved for the default case).
- If the user scrolls up at any point, auto-scroll is suspended — the view stays where
  the user left it even as new tokens arrive.
- Auto-scroll resumes automatically once the user scrolls back to within ~100px of the
  bottom of the message list (no button required).
- The scroll container itself (`overflow-y: auto`) must handle the `onScroll` event to
  track proximity to the bottom.
- Existing `data-testid="scroll-sentinel"` element may be kept or removed, but the new
  logic must not call `scrollIntoView` when the user has scrolled up.

## Non-Goals
- Adding a "jump to bottom" floating button (can be a follow-on).
- Changing the streaming mechanism or message update frequency.
