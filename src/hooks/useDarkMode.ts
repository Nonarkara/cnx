"use client";

// Dark mode toggle — same hook as Lopburi. The toggle sets a
// `data-theme="dark"` attribute on <html>; the CSS overrides live in
// globals.css under :root[data-theme="dark"].

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cnx.theme";

export function useDarkMode() {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.dataset.theme = "dark";
    } else if (stored === "light") {
      setIsDark(false);
      delete document.documentElement.dataset.theme;
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      setIsDark(true);
      document.documentElement.dataset.theme = "dark";
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.dataset.theme = "dark";
        window.localStorage.setItem(STORAGE_KEY, "dark");
      } else {
        delete document.documentElement.dataset.theme;
        window.localStorage.setItem(STORAGE_KEY, "light");
      }
      return next;
    });
  }, []);

  return [isDark, toggleTheme] as const;
}