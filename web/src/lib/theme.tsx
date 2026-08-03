"use client";

/**
 * Light / dark / system theme, stored per device.
 *
 * A device preference rather than family data — the same person may want dark on
 * their phone at night and light on a laptop — so it lives in localStorage
 * alongside the language choice, not in the vault state.
 *
 * The provider only sets `data-theme` on <html>; the actual colours are CSS
 * variables in globals.css, which handle "system" through prefers-color-scheme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "jv:theme:v1";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // "system" on first render so the prerendered HTML is deterministic; the
  // stored preference is adopted on mount.
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // Absence of the attribute means "follow the OS", which is what the
    // prefers-color-scheme rules in globals.css key off.
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice simply won't persist across reloads.
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
