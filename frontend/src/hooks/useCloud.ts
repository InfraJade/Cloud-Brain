import { useQuery } from "@tanstack/react-query";
import { ApiError, api, type CostQuery } from "@/lib/api";
import { sampleCostCurrent, sampleForecast, sampleInventory } from "@/lib/sampleData";
import { rememberCostKeys } from "@/lib/knownValues";
import { usePrefs } from "@/contexts/PrefsContext";

// Refresh limits from the spec (§3): the server caches cost for an hour and inventory for a
// minute, so never auto-refresh cost more than every 15 minutes or inventory every 2.
const INVENTORY_REFRESH_MS = 2 * 60_000;
const COST_REFRESH_MS = 15 * 60_000;
const REGISTRY_REFRESH_MS = 60_000;

/** Canonical form of a cost query, so equivalent queries share one cache entry (and one Cost Explorer call). */
function normalize(q: CostQuery, allowGroupBy: boolean): CostQuery {
  const filters: CostQuery["filters"] = {};
  for (const [key, values] of Object.entries(q.filters ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (values && values.length) filters[key as keyof NonNullable<CostQuery["filters"]>] = [...values].sort();
  }
  return {
    ...(allowGroupBy ? { group_by: q.group_by ?? "service" } : {}),
    ...(q.metric && q.metric !== "UnblendedCost" ? { metric: q.metric } : {}),
    ...(q.exclude_credits ? { exclude_credits: true } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

/** While an endpoint isn't deployed (404 from API Gateway), show the spec's example data instead. */
async function withSample<T>(fetcher: () => Promise<T>, sample: () => T): Promise<T> {
  try {
    return await fetcher();
  } catch (err) {
    if (err instanceof ApiError && err.notDeployed) return sample();
    throw err;
  }
}

export function useResources() {
  const { prefs } = usePrefs();
  return useQuery({
    queryKey: ["resources"],
    queryFn: () => api.listResources(),
    refetchInterval: prefs.autoRefresh ? REGISTRY_REFRESH_MS : false,
    placeholderData: (prev) => prev,
  });
}

export function useCloudConfig() {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 5 * 60_000 });
}

/** C — GET /inventory. `region` undefined = the backend's default, "all" = every enabled region. */
export function useInventory(region?: string) {
  const { prefs } = usePrefs();
  return useQuery({
    queryKey: ["inventory", region ?? "default"],
    queryFn: () => withSample(() => api.inventory(region), () => sampleInventory(region)),
    staleTime: 60_000,
    refetchInterval: prefs.autoRefresh ? INVENTORY_REFRESH_MS : false,
    placeholderData: (prev) => prev,
  });
}

/** A — GET /cost/current. */
export function useCostCurrent(query: CostQuery = { group_by: "service" }) {
  const { prefs } = usePrefs();
  const q = normalize(query, true);
  return useQuery({
    queryKey: ["cost-current", q],
    queryFn: async () => {
      const data = await withSample(() => api.costCurrent(q), () => sampleCostCurrent(q));
      rememberCostKeys(data.group_by, data.top.map((t) => t.key), Boolean(data.sample));
      return data;
    },
    staleTime: 5 * 60_000,
    refetchInterval: prefs.autoRefresh ? COST_REFRESH_MS : false,
    placeholderData: (prev) => prev,
  });
}

/** B — GET /cost/forecast (filters allowed, group_by not). */
export function useCostForecast(q: CostQuery = {}) {
  const { prefs } = usePrefs();
  const query = normalize(q, false);
  return useQuery({
    queryKey: ["cost-forecast", query],
    queryFn: () => withSample(() => api.costForecast(query), () => sampleForecast(query)),
    staleTime: 5 * 60_000,
    refetchInterval: prefs.autoRefresh ? COST_REFRESH_MS : false,
    placeholderData: (prev) => prev,
  });
}
