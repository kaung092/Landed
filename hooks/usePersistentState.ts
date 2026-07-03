"use client";

import { useEffect, useState } from "react";

// localStorage-backed state: a view value (active tab, selected item, …) that survives reloads AND
// navigating away and back. SSR-safe — the server renders `initial`, the client rehydrates from
// storage on mount. Same API shape as useState.
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const s = localStorage.getItem(key);
      return s != null ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota — skip */ }
  }, [key, value]);

  return [value, setValue];
}
