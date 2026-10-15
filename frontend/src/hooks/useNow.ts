import { useEffect, useState } from "react";

/** Re-render every `intervalMs` so relative times ("Updated 4 min ago", countdowns) stay current. */
export function useNow(intervalMs = 30_000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, enabled]);
  return now;
}
