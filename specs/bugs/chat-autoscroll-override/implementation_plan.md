id: bugs__chat-autoscroll-override
overview: >
  Fix the unconditional auto-scroll in MessageList so that scrolling up during
  streaming suspends auto-follow, and auto-scroll resumes only when the user
  returns to within ~100px of the bottom.
status: done
acceptance_criteria:
  - >
    When no manual scroll has occurred, the message list auto-scrolls to the
    bottom on every message update (existing default behaviour preserved).
  - >
    When the user scrolls up during streaming, the view stays at the user's
    scroll position and does not snap back to the bottom on subsequent message
    updates.
  - >
    Auto-scroll automatically resumes (without a button press) once the user
    scrolls back to within 100px of the bottom of the scroll container.
  - >
    The scroll container div in MessageList has an onScroll handler that tracks
    proximity to the bottom and sets/clears a userHasScrolledUp flag.
  - >
    Unit tests in MessageList.test.tsx verify scroll-follow, scroll-suspend,
    and scroll-resume behaviour.
tasks:
  - task: >
      Modify client/src/components/MessageList.tsx to add scroll-position
      tracking and conditional auto-scroll:

      1. Add a ref for the scroll container:
         `const scrollContainerRef = useRef<HTMLDivElement>(null);`

      2. Add a ref to track whether the user has scrolled up:
         `const userHasScrolledUp = useRef(false);`
         Use a ref (not state) to avoid re-renders on every scroll event.

      3. Add an onScroll handler on the scroll container div (the one with
         `style={{ overflowY: "auto", flex: 1 }}` at line 27):
         ```tsx
         const handleScroll = () => {
           const el = scrollContainerRef.current;
           if (!el) return;
           const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
           userHasScrolledUp.current = distanceFromBottom > 100;
         };
         ```

      4. Attach ref and handler to the scroll container div:
         `<div ref={scrollContainerRef} onScroll={handleScroll} style={{ overflowY: "auto", flex: 1 }}>`

      5. Make the existing useEffect conditional — only auto-scroll when the
         user has NOT scrolled up:
         ```tsx
         useEffect(() => {
           if (!userHasScrolledUp.current) {
             bottomRef.current?.scrollIntoView({ behavior: "smooth" });
           }
         }, [messages]);
         ```

      Keep the existing bottomRef and scroll-sentinel div unchanged.
    refs:
      - specs/bugs/chat-autoscroll-override/requirements.md
      - specs/bugs/chat-autoscroll-override/research.md
    priority: high
    status: todo

  - task: >
      Add tests to client/src/components/MessageList.test.tsx for the new
      scroll behaviour. The existing beforeAll stub for scrollIntoView
      (line 9-11) should be kept. Add the following test cases:

      1. "auto-scrolls to bottom when user has not scrolled up":
         - Render MessageList with one message.
         - Confirm scrollIntoView was called.
         - Rerender with two messages.
         - Confirm scrollIntoView was called again.

      2. "does not auto-scroll when user has scrolled up":
         - Render MessageList with one message.
         - Get the scroll container (the parent div of the messages) and
           mock its scroll geometry: set scrollHeight=1000, scrollTop=0,
           clientHeight=500 (distance from bottom = 500, well above 100px).
         - Fire a 'scroll' event on the scroll container.
         - Clear the scrollIntoView mock.
         - Rerender with two messages.
         - Confirm scrollIntoView was NOT called.

      3. "resumes auto-scroll when user scrolls back near bottom":
         - Render MessageList with one message.
         - Mock scroll geometry to simulate user scrolled up
           (scrollHeight=1000, scrollTop=0, clientHeight=500).
         - Fire 'scroll' event. Clear scrollIntoView mock.
         - Now mock geometry near bottom (scrollHeight=1000, scrollTop=450,
           clientHeight=500 → distance=50, under 100px threshold).
         - Fire 'scroll' event again.
         - Rerender with two messages.
         - Confirm scrollIntoView WAS called.

      4. "threshold boundary: exactly 100px does not resume auto-scroll":
         - Mock scroll geometry so distance from bottom = exactly 100px.
         - Fire 'scroll' event.
         - Rerender with new messages.
         - Confirm scrollIntoView was NOT called (100 is not < 100).

      Use the existing test pattern: `render(<MessageList messages={...} />)`
      with UIMessage objects having at minimum `{ id, role, content, parts }`.
      Use `vi.fn()` for the scrollIntoView mock. Use `fireEvent.scroll()` from
      @testing-library/react to dispatch scroll events.

      To access the scroll container, use the fact that it is the parent
      element of the scroll sentinel: find `[data-testid="scroll-sentinel"]`
      and use `.parentElement` or `.closest('div')`.

      To mock scroll geometry (scrollHeight, scrollTop, clientHeight), use
      `Object.defineProperty` on the scroll container element for each
      property.
    refs:
      - specs/bugs/chat-autoscroll-override/requirements.md
      - specs/bugs/chat-autoscroll-override/research.md
    priority: high
    status: todo
