import { describe, it, expect, vi } from "vitest";
import { render, act, renderHook } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { DebugProvider, useDebugEmit, useDebugLog, DebugEmitContext, DebugLogContext } from "./debug-context";
import type { DebugEvent } from "./types";

function makeEvent(overrides: Partial<DebugEvent> = {}): DebugEvent {
  return {
    id: "test-id",
    timestamp: new Date(),
    actor: "llm",
    type: "request",
    summary: "test summary",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <DebugProvider>{children}</DebugProvider>;
}

describe("DebugProvider / useDebugLog", () => {
  it("starts with an empty event log", () => {
    const { result } = renderHook(() => useDebugLog(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it("emit adds events to the log", () => {
    const { result: emitResult } = renderHook(() => useDebugEmit(), { wrapper });
    const { result: logResult } = renderHook(() => useDebugLog(), { wrapper });

    // Use a shared provider
    const { result: combined } = renderHook(
      () => ({ emit: useDebugEmit(), log: useDebugLog() }),
      { wrapper }
    );

    const event = makeEvent({ id: "e1" });
    act(() => {
      combined.current.emit.emit(event);
    });
    expect(combined.current.log).toHaveLength(1);
    expect(combined.current.log[0]).toBe(event);

    // Suppress unused variable warnings
    void emitResult;
    void logResult;
  });

  it("clear resets log to []", () => {
    const { result } = renderHook(
      () => ({ emit: useDebugEmit(), log: useDebugLog() }),
      { wrapper }
    );

    act(() => {
      result.current.emit.emit(makeEvent({ id: "e1" }));
      result.current.emit.emit(makeEvent({ id: "e2" }));
    });
    expect(result.current.log).toHaveLength(2);

    act(() => {
      result.current.emit.clear();
    });
    expect(result.current.log).toEqual([]);
  });

  it("useDebugLog consumers receive updated events after emit", () => {
    const { result } = renderHook(
      () => ({ emit: useDebugEmit(), log: useDebugLog() }),
      { wrapper }
    );

    const e1 = makeEvent({ id: "e1", summary: "first" });
    const e2 = makeEvent({ id: "e2", summary: "second" });

    act(() => {
      result.current.emit.emit(e1);
    });
    expect(result.current.log).toHaveLength(1);
    expect(result.current.log[0].summary).toBe("first");

    act(() => {
      result.current.emit.emit(e2);
    });
    expect(result.current.log).toHaveLength(2);
    expect(result.current.log[1].summary).toBe("second");
  });
});

describe("useDebugEmit stability", () => {
  it("returns a stable reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useDebugEmit(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("emit and clear functions have stable identity across re-renders", () => {
    const { result: combined, rerender } = renderHook(
      () => ({ emit: useDebugEmit(), log: useDebugLog() }),
      { wrapper }
    );

    const emitFn = combined.current.emit.emit;
    const clearFn = combined.current.emit.clear;

    // Trigger a re-render by emitting
    act(() => {
      combined.current.emit.emit(makeEvent());
    });

    rerender();

    expect(combined.current.emit.emit).toBe(emitFn);
    expect(combined.current.emit.clear).toBe(clearFn);
  });

  it("components using only useDebugEmit do not re-render when log changes", () => {
    const renderCount = { current: 0 };

    function EmitOnlyComponent() {
      renderCount.current += 1;
      const { emit } = useDebugEmit();
      const ref = useRef(emit);
      ref.current = emit;
      return null;
    }

    function LogConsumer() {
      useDebugLog(); // subscribes to log changes
      return null;
    }

    const { rerender } = render(
      <DebugProvider>
        <EmitOnlyComponent />
        <LogConsumer />
      </DebugProvider>
    );

    const countAfterMount = renderCount.current;

    // Trigger a log change via DebugLogContext — simulate by calling emit from outside
    // We need to call emit from within the tree; do it via a test component
    const emitRef = { current: (_e: DebugEvent) => {} };

    function EmitCapture() {
      const { emit } = useDebugEmit();
      emitRef.current = emit;
      return null;
    }

    rerender(
      <DebugProvider>
        <EmitOnlyComponent />
        <LogConsumer />
        <EmitCapture />
      </DebugProvider>
    );

    act(() => {
      emitRef.current(makeEvent({ id: "x" }));
    });

    // EmitOnlyComponent should not have re-rendered after the log changed
    // (only the rerender of the component tree itself may add one render)
    // The key assertion: render count did not increase due to log change
    expect(renderCount.current).toBeLessThanOrEqual(countAfterMount + 1);
  });
});

describe("context exports", () => {
  it("DebugEmitContext and DebugLogContext are exported", () => {
    expect(DebugEmitContext).toBeDefined();
    expect(DebugLogContext).toBeDefined();
  });
});

describe("DebugProvider (render test)", () => {
  it("renders children", () => {
    const { getByText } = render(
      <DebugProvider>
        <span>hello</span>
      </DebugProvider>
    );
    expect(getByText("hello")).toBeTruthy();
  });
});

describe("useDebugEmit outside provider", () => {
  it("returns no-op functions when used outside provider", () => {
    const { result } = renderHook(() => useDebugEmit());
    expect(() => result.current.emit(makeEvent())).not.toThrow();
    expect(() => result.current.clear()).not.toThrow();
  });
});

describe("useDebugLog outside provider", () => {
  it("returns empty array when used outside provider", () => {
    const { result } = renderHook(() => useDebugLog());
    expect(result.current).toEqual([]);
  });
});
