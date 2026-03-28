import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DebugEvent } from "./types";

interface DebugEmit {
  emit: (event: DebugEvent) => void;
  clear: () => void;
}

export const DebugEmitContext = createContext<DebugEmit>({
  emit: () => {},
  clear: () => {},
});

export const DebugLogContext = createContext<DebugEvent[]>([]);

export function DebugProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DebugEvent[]>([]);

  const emit = useCallback((event: DebugEvent) => {
    setEvents((prev) => [...prev, event]);
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  const emitValue = useMemo(() => ({ emit, clear }), [emit, clear]);

  return (
    <DebugEmitContext.Provider value={emitValue}>
      <DebugLogContext.Provider value={events}>
        {children}
      </DebugLogContext.Provider>
    </DebugEmitContext.Provider>
  );
}

export function useDebugEmit(): DebugEmit {
  return useContext(DebugEmitContext);
}

export function useDebugLog(): DebugEvent[] {
  return useContext(DebugLogContext);
}
