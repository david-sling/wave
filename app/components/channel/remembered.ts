"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A choice that outlives the page, kept in localStorage.
 *
 * Read through `useSyncExternalStore` so the server render and the first
 * client render agree on the default, and so every box on the page that reads
 * the same key moves together: the channel page mounts two prompt boxes, and
 * choosing in one must not leave the other showing the old choice.
 *
 * Storage can be missing or refuse writes (private windows, blocked site
 * data). A choice that could not be saved is kept in memory instead, so it
 * still holds for this page.
 */

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
