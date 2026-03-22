"use client";
import { useState, useEffect, useCallback } from "react";

export type Theme = "dark" | "light";

/**
 * Shared theme hook. All instances stay in sync via a custom DOM event.
 * Initializes to "dark" on both server and client to avoid hydration mismatch,
 * then reads localStorage in useEffect (client-only).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // On mount, apply the stored theme to the DOM
  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme) || "dark";
    setThemeState(stored);
    document.documentElement.setAttribute("data-theme", stored);
    setMounted(true);
  }, []);

  // Listen for theme changes from OTHER useTheme instances
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<Theme>).detail;
      setThemeState(t);
    };
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
    window.dispatchEvent(new CustomEvent("theme-change", { detail: t }));
  }, []);

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, setTheme, toggle, mounted };
}
