import { useEffect, useRef } from 'react';

export type DebouncedCallback<T extends (...args: any[]) => void> = T & {
  /** Runs the pending call now, if there is one. A no-op otherwise. */
  flush: () => void;
};

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): DebouncedCallback<T> {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const run = () => {
    const args = pendingArgsRef.current;
    timeoutRef.current = null;
    pendingArgsRef.current = null;
    if (args) callbackRef.current(...args);
  };

  const debounced = (...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    pendingArgsRef.current = args;
    timeoutRef.current = setTimeout(run, delay);
  };

  const flush = () => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    run();
  };

  return Object.assign(debounced, { flush }) as DebouncedCallback<T>;
}
