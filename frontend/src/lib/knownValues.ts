import { useSyncExternalStore } from "react";
import type { FilterKey, GroupBy } from "./api";

// Values seen in earlier cost responses, used as filter options. The spec (§4.2) says
// filter values must match Cost Explorer exactly — e.g. service names — so they're taken
// from `top[].key` of earlier responses rather than typed by hand.

const store = new Map<FilterKey, Set<string>>();
const sampleStore = new Map<FilterKey, Set<string>>();
const listeners = new Set<() => void>();
let version = 0;

export function rememberCostKeys(groupBy: GroupBy, keys: string[], isSample: boolean) {
  if (groupBy === "none") return;
  const target = isSample ? sampleStore : store;
  const set = target.get(groupBy) ?? new Set<string>();
  let changed = false;
  for (const k of keys) {
    if (k && k !== "(untagged)" && !set.has(k)) {
      set.add(k);
      changed = true;
    }
  }
  if (changed) {
    target.set(groupBy, set);
    version++;
    listeners.forEach((l) => l());
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Real values when any exist; sample values only as a fallback while costs are previewed. */
export function useKnownValues(key: FilterKey): string[] {
  useSyncExternalStore(subscribe, () => version);
  const real = store.get(key);
  const values = real && real.size ? real : sampleStore.get(key);
  return values ? [...values].sort((a, b) => a.localeCompare(b)) : [];
}
