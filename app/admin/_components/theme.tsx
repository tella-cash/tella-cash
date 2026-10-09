"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ADMIN_THEME_COOKIE,
  ADMIN_THEME_PATH,
  ADMIN_THEMES,
  type AdminTheme,
} from "@/lib/admin/theme";

/**
 * The element every admin colour hangs off, and the control that changes it.
 *
 * The server reads the cookie and passes the theme in, so the first paint is
 * already right. Changing it here updates the attribute immediately and
 * writes the cookie for next time; there is no round trip, because nothing
 * on the server depends on it until the next page load.
 *
 * The CSS that reacts to `data-theme` is in app/globals.css.
 */

interface ThemeState {
  theme: AdminTheme;
  setTheme: (next: AdminTheme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export function ThemeRoot({
  initial,
  children,
}: {
  initial: AdminTheme;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<AdminTheme>(initial);

  const setTheme = useCallback((next: AdminTheme) => {
    setThemeState(next);
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${ADMIN_THEME_COOKIE}=${next}; path=${ADMIN_THEME_PATH}; max-age=${YEAR_SECONDS}; samesite=lax${secure}`;
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeContext value={value}>
      {/* data-lenis-prevent: the site-wide smooth scrolling adds inertia,
          which suits a landing page and gets in the way of reading a table. */}
      <div className="admin-theme" data-theme={theme} data-lenis-prevent>
        {children}
      </div>
    </ThemeContext>
  );
}

const LABEL: Record<AdminTheme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * Real radio inputs, visually replaced, so arrow keys and screen readers get
 * the behaviour of a radio group without any of it being reimplemented.
 */
export function ThemeSetting() {
  const state = useContext(ThemeContext);
  if (!state) return null;
  const { theme, setTheme } = state;

  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-900">Appearance</legend>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-100 p-1">
        {ADMIN_THEMES.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="radio"
              name="admin-theme"
              value={option}
              checked={theme === option}
              onChange={() => setTheme(option)}
              className="peer sr-only"
            />
            <span className="block rounded-lg px-3 py-1.5 text-center text-sm text-ink-500 transition-colors duration-200 peer-checked:bg-surface-0 peer-checked:font-medium peer-checked:text-ink-900 peer-checked:shadow-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-500 hover:text-ink-900">
              {LABEL[option]}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        System follows this device. The choice is remembered in this browser.
      </p>
    </fieldset>
  );
}
