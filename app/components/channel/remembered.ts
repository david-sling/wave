"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "wave:remembered";
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function read(key: string): string | null {
  const unsaved = memory.get(key);
  if (unsaved !== undefined) return unsaved;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useRemembered<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const saved = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = saved !== null && (allowed as readonly string[]).includes(saved) ? (saved as T) : fallback;

  const choose = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
        memory.delete(key);
      } catch {
        memory.set(key, next);
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );

  return [value, choose];
}
