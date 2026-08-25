"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { saveThemeAction } from "@/app/theme-actions";

const KEY = "leavebase-theme";

type Theme = "light" | "dark";

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  // Read the choice the server already applied to <html>, so the button starts in the right state.
  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial: Theme =
      attr === "dark" || attr === "light"
        ? (attr as Theme)
        : stored ??
          (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    setReady(true);
  }, []);

  const next: Theme = theme === "light" ? "dark" : "light";

  function toggle() {
    setTheme(next);
    apply(next);
    // localStorage keeps this device instant on the next load; the server call makes the choice
    // follow the employee to any other browser or machine.
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // private browsing — the server copy still carries the preference
    }
    void saveThemeAction(next === "dark" ? "DARK" : "LIGHT");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="flex items-center justify-center rounded-full transition-colors"
      style={{
        width: compact ? 34 : 38,
        height: compact ? 34 : 38,
        background: "var(--c-ink-100)",
        color: "var(--c-ink-500)",
        opacity: ready ? 1 : 0,
      }}
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

/**
 * Applies the theme before first paint so there is no flash of the wrong palette.
 *
 * `serverTheme` is the signed-in employee's stored preference, already rendered onto <html> by the
 * root layout. When it is present it wins, and is mirrored into localStorage so a later visit on
 * this device is instant even before the session is read. When absent (signed out, or set to
 * follow the device) we fall back to localStorage, then the OS setting.
 */
export function ThemeScript({ serverTheme }: { serverTheme?: string | null }) {
  const server = serverTheme === "DARK" ? "dark" : serverTheme === "LIGHT" ? "light" : "";
  const js = `(function(){try{
var s=${JSON.stringify(server)};
if(s){localStorage.setItem('${KEY}',s);document.documentElement.setAttribute('data-theme',s);return;}
var t=localStorage.getItem('${KEY}');
if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
document.documentElement.setAttribute('data-theme',t);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
