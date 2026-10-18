"use client";

import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

export const THEME_KEY = "footballdex-theme";

const MODES: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Light" },
  { mode: "dark", label: "Dark" },
  { mode: "system", label: "System" },
];

function apply(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

const ICONS: Record<ThemeMode, React.ReactNode> = {
  light: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4" width="19" height="12.5" rx="1.5" />
      <path d="M9 20.5h6M12 16.5v4" />
    </svg>
  ),
};

export function ThemeToggle() {
  // First render must match the server, which always renders "light"; the stored choice is
  // read in an effect so hydration cannot disagree.
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    let stored: ThemeMode = "light";
    try {
      const v = localStorage.getItem(THEME_KEY);
      if (v === "light" || v === "dark" || v === "system") stored = v;
    } catch {
      /* private mode */
    }
    setMode(stored);
  }, []);

  // While the mode is "system", follow the OS as it changes. A change event can be missed
  // while the tab is hidden, so returning to the tab re-applies the current OS preference.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [mode]);

  function pick(next: ThemeMode) {
    setMode(next);
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode */
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-line bg-pitch-900 p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          onClick={() => pick(m.mode)}
          aria-pressed={mode === m.mode}
          title={`${m.label} theme`}
          data-testid={`theme-${m.mode}`}
          className={`rounded-full px-2 py-1 text-[12px] leading-none transition ${
            mode === m.mode
              ? "bg-turf/15 text-turf"
              : "text-muted hover:bg-pitch-850 hover:text-fg"
          }`}
        >
          <span aria-hidden="true">{ICONS[m.mode]}</span>
          <span className="sr-only">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
