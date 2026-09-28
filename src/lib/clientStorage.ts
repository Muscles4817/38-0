'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// localStorage is the source of truth for a run in progress: the setup chosen
// on the home page, the XI being drafted, the squads seen so far. Reading it
// through useSyncExternalStore rather than an on-mount effect means a write
// from anywhere re-renders every reader, and server rendering gets a defined
// empty snapshot instead of a hydration mismatch.

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  // Fires for writes from other tabs; same-tab writes go through emit().
  window.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/**
 * Saves a value, and reports whether it was saved.
 *
 * setItem throws when the origin's quota is full (QuotaExceededError) or
 * storage is unavailable, as in some private modes. Letting that escape took
 * the action that made the write down with it: a full quota once left the Spin
 * button doing nothing. A failed save is logged and otherwise ignored, so the
 * game keeps working for the rest of the session even if it cannot remember it.
 */
export function writeStored(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key} to localStorage`, error);
    return false;
  }
  emit();
  return true;
}

export function clearStored(...keys: string[]): void {
  for (const key of keys) localStorage.removeItem(key);
  emit();
}

export function readStored<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Subscribes to a JSON value in localStorage.
 *
 * Returns null while server rendering and on the hydrating render, then the
 * stored value. Callers that must distinguish "not loaded yet" from "absent"
 * should render a loading state for null.
 */
export function useStoredJson<T>(key: string): T | null {
  // getSnapshot must be stable and must return a value that compares equal
  // across calls, so it returns the raw string and parsing happens in useMemo.
  const getSnapshot = useCallback(() => localStorage.getItem(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);

  return useMemo(() => {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);
}
