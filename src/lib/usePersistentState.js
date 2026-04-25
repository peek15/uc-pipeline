// ═══════════════════════════════════════════════════════════
// usePersistentState — drop-in replacement for useState that
// reads/writes localStorage, scoped under "uc_ui_*" keys.
// v3.9.0
//
// Same API as useState. Reads on mount; writes (debounced 200ms)
// on every value change. Falls back gracefully if storage is
// unavailable (private browsing, full quota).
//
// Usage:
//   const [tab, setTab] = usePersistentState("tab", "pipeline");
//
// Special handling for Set values: serialized as arrays.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";

const PREFIX = "uc_ui_";
const DEBOUNCE_MS = 200;

function read(key, defaultValue) {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return defaultValue;
    const parsed = JSON.parse(raw);
    // Set values are stored with a marker — restore them
    if (parsed && parsed.__type === "Set" && Array.isArray(parsed.values)) {
      return new Set(parsed.values);
    }
    return parsed;
  } catch {
    return defaultValue;
  }
}

function write(key, value) {
  if (typeof window === "undefined") return;
  try {
    let toStore = value;
    if (value instanceof Set) {
      toStore = { __type: "Set", values: Array.from(value) };
    }
    window.localStorage.setItem(PREFIX + key, JSON.stringify(toStore));
  } catch {
    // Quota full, blocked, or other — silently ignore
  }
}

/**
 * Same API as useState; persists to localStorage under "uc_ui_<key>".
 *
 * @param {string} key                — short key, no whitespace
 * @param {*}      defaultValue       — used when nothing in storage
 * @returns {[value, setValue]}
 */
export function usePersistentState(key, defaultValue) {
  // Lazy init reads from localStorage exactly once
  const [value, setValue] = useState(() => read(key, defaultValue));

  // Debounced write
  const timerRef = useRef(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => write(key, value), DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [key, value]);

  return [value, setValue];
}

/**
 * Clear a specific persisted UI key. Useful for "Reset" buttons.
 */
export function clearPersistentState(key) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PREFIX + key); } catch {}
}

/**
 * Clear all UI state (keeps `uc_settings` and other non-UI prefs).
 */
export function clearAllPersistentUI() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach(k => window.localStorage.removeItem(k));
  } catch {}
}
