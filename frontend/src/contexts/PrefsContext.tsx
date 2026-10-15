import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readJson, writeJson } from "@/lib/storage";

export type Theme = "light" | "dark" | "system";

export type Prefs = {
  theme: Theme;
  showChatWidget: boolean;
  autoTrack: boolean;
  defaultInstanceType: string;
  defaultOs: string;
  /** Auto-refresh dashboard data (inventory every 2 min, costs every 15 min, registry every minute). */
  autoRefresh: boolean;
  /** Last region chosen on the dashboard: "" = backend default, "all", or a region code. */
  dashboardRegion: string;
};

const DEFAULTS: Prefs = {
  theme: "system",
  showChatWidget: true,
  autoTrack: true,
  defaultInstanceType: "t3.micro",
  defaultOs: "ubuntu",
  autoRefresh: true,
  dashboardRegion: "",
};

// Also read by the inline script in index.html to apply the theme before first paint.
const PREFS_KEY = "cb_prefs";

type PrefsContextValue = {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  resetPrefs: () => void;
  resolvedTheme: "light" | "dark";
};

const PrefsContext = createContext<PrefsContextValue | undefined>(undefined);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function loadPrefs(): Prefs {
  const saved = readJson<Partial<Prefs> & Record<string, unknown>>(PREFS_KEY, {});
  const merged = { ...DEFAULTS, ...saved };
  // Keep only known keys (drops settings from earlier versions).
  return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, merged[k as keyof Prefs]])) as Prefs;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [osDark, setOsDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = prefs.theme === "system" ? (osDark ? "dark" : "light") : prefs.theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => writeJson(PREFS_KEY, prefs), [prefs]);

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);

  const resetPrefs = useCallback(() => setPrefs(DEFAULTS), []);

  const value = useMemo(() => ({ prefs, setPref, resetPrefs, resolvedTheme }), [prefs, setPref, resetPrefs, resolvedTheme]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
