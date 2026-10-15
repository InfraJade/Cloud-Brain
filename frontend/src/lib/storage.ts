// Browser storage that never throws — it can be unavailable (private mode, blocked site data).
// Only used for per-browser conveniences: preferences, the activity log, the open chat.

export function readJson<T>(key: string, fallback: T, store: "local" | "session" = "local"): T {
  try {
    const raw = (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, store: "local" | "session" = "local") {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // ignore — storage unavailable or full
  }
}

export function removeKey(key: string, store: "local" | "session" = "local") {
  try {
    (store === "local" ? window.localStorage : window.sessionStorage).removeItem(key);
  } catch {
    // ignore
  }
}
