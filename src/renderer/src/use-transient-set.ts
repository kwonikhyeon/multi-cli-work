import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keys that carry a value for a moment and then drop out on their own — the state behind one-shot
 * signals like "this pane just finished". Each key has its own timer, so flashing one session never
 * cuts another's short, and flashing the same key again restarts its clock instead of stacking.
 */
export function useTransientSet<K, V>(durationMs: number) {
  const [map, setMap] = useState<ReadonlyMap<K, V>>(() => new Map());
  const timers = useRef(new Map<K, ReturnType<typeof setTimeout>>());

  const remove = useCallback((key: K) => {
    setMap((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const flash = useCallback(
    (key: K, value: V) => {
      clearTimeout(timers.current.get(key));
      setMap((current) => new Map(current).set(key, value));
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          remove(key);
        }, durationMs),
      );
    },
    [durationMs, remove],
  );

  const clear = useCallback(
    (key: K) => {
      clearTimeout(timers.current.get(key));
      timers.current.delete(key);
      remove(key);
    },
    [remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { map, flash, clear };
}
