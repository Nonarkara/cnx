"use client";

// Language mode as a tiny external store: any component can read it without
// a provider, every subscriber re-renders together, and the choice survives
// a reload. <html lang> follows the mode for screen readers and fonts.

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LANG, LANG_STORAGE_KEY, isLang, pick, type Lang } from "../lib/i18n";

const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  if (current) return current;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    current = isLang(stored) ? stored : DEFAULT_LANG;
  } catch {
    current = DEFAULT_LANG;
  }
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  document.documentElement.lang = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current mode, setter, and `t(th, en)` for inline strings. */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (th: string, en: string | null | undefined) => string } {
  const lang = useSyncExternalStore(subscribe, read, () => DEFAULT_LANG);
  const t = useCallback((th: string, en: string | null | undefined) => pick(lang, th, en), [lang]);
  return { lang, setLang, t };
}

/** For tests: reset the module store. */
export function __resetLangForTests(lang: Lang | null = null): void {
  current = lang;
}
