import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api, type Resource } from "@/lib/api";
import type { StatusTone } from "@/lib/format";
import { readJson, removeKey, writeJson } from "@/lib/storage";
import { useAuth } from "./AuthContext";

// Provisioning and deletion are asynchronous on AWS (spec §5.1/§5.2): the API accepts the
// request, and the resource appears (or disappears) minutes later, after CodeBuild runs
// Terraform. Each request submitted from this browser is tracked here: pending requests are
// checked every 15 s against the resource registry, and given up on after 20 minutes —
// failures aren't recorded anywhere the API can see yet (issue 5).

export type RequestState = "submitted" | "committed" | "active" | "deleting" | "deleted" | "failed" | "timed_out";
export type RequestOrigin = "form" | "assistant" | "registry";

export type TrackedRequest = {
  request_id: string;
  origin: RequestOrigin;
  summary: string;
  resource_type?: string;
  project?: string;
  env?: string;
  instance_type?: string;
  os_name?: string;
  submitted_at: number;
  state: RequestState;
  /** Registry records last seen for this request. */
  resources?: Resource[];
  /** The resource created (provision) or being deleted. */
  resource_id?: string;
  delete_ticket_id?: string;
  delete_requested_at?: number;
  checked_at?: number;
  check_error?: string;
  /** Assistant workflow failure (tracking.error / tracking.cause). */
  error?: string;
  cause?: string;
};

export const POLL_INTERVAL_MS = 15_000;
export const GIVE_UP_AFTER_MS = 20 * 60_000;

export const isPending = (r: TrackedRequest) => r.state === "submitted" || r.state === "committed" || r.state === "deleting";
export const isDeletePhase = (r: TrackedRequest) => r.delete_requested_at !== undefined;

export function requestStateMeta(r: TrackedRequest): { label: string; tone: StatusTone } {
  switch (r.state) {
    case "submitted":
    case "committed":
      return { label: "Creating…", tone: "warning" };
    case "active":
      return { label: "Active", tone: "good" };
    case "deleting":
      return { label: "Deleting…", tone: "serious" };
    case "deleted":
      return { label: "Deleted", tone: "neutral" };
    case "failed":
      return { label: "Failed", tone: "critical" };
    case "timed_out":
      return { label: "Taking longer than expected", tone: "warning" };
  }
}

type NewProvision = Omit<TrackedRequest, "state" | "submitted_at"> & { state?: RequestState; submitted_at?: number };
type NewDelete = {
  request_id: string;
  resource_id: string;
  delete_ticket_id: string;
  origin?: RequestOrigin;
  summary?: string;
  resource_type?: string;
  project?: string;
  env?: string;
};

type RequestsContextValue = {
  requests: TrackedRequest[];
  pendingCount: number;
  get: (requestId: string) => TrackedRequest | undefined;
  trackProvision: (input: NewProvision) => void;
  trackDelete: (input: NewDelete) => void;
  update: (requestId: string, patch: Partial<TrackedRequest>) => void;
  checkNow: (requestId: string) => Promise<void>;
  remove: (requestId: string) => void;
  clearFinished: () => void;
};

const RequestsContext = createContext<RequestsContextValue | undefined>(undefined);

/** Convert the log kept by earlier versions of the app (one-time). */
function migrateOldLog(email: string): TrackedRequest[] {
  const oldKey = `cb_activity_${email}`;
  const old = readJson<any[]>(oldKey, []);
  if (!old.length) return [];
  removeKey(oldKey);
  return old
    .filter((e) => e && e.request_id)
    .map((e) => {
      const isDelete = e.kind === "delete";
      const state: RequestState = isDelete
        ? e.state === "completed" ? "deleted" : e.state === "failed" ? "failed" : "deleting"
        : e.state === "completed" ? "active" : e.state === "failed" ? "failed" : "submitted";
      return {
        request_id: e.request_id,
        origin: e.source === "assistant" ? "assistant" : "form",
        summary: e.summary ?? e.request_id,
        resource_type: e.resource_type,
        project: e.project,
        env: e.env,
        resource_id: e.resource_id ?? undefined,
        submitted_at: e.submitted_at ?? Date.now(),
        state,
        ...(isDelete ? { delete_requested_at: e.submitted_at ?? Date.now() } : {}),
      } as TrackedRequest;
    });
}

/** Mounted per user (keyed by email in App), so each user's requests load fresh. */
export function RequestsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const email = user?.email ?? "anon";
  const key = `cb_requests_${email}`;

  const [requests, setRequests] = useState<TrackedRequest[]>(() => {
    const saved = readJson<TrackedRequest[]>(key, []);
    const migrated = migrateOldLog(email).filter((m) => !saved.some((s) => s.request_id === m.request_id));
    return [...saved, ...migrated];
  });
  const ref = useRef(requests);
  ref.current = requests;
  const inFlight = useRef(new Set<string>());

  useEffect(() => writeJson(key, requests), [key, requests]);

  const update = useCallback((requestId: string, patch: Partial<TrackedRequest>) => {
    setRequests((list) => list.map((r) => (r.request_id === requestId ? { ...r, ...patch } : r)));
  }, []);

  const announce = useCallback(
    (r: TrackedRequest, next: RequestState, resources: Resource[] = []) => {
      const view = { label: "View", onClick: () => navigate(`/requests/${encodeURIComponent(r.request_id)}`) };
      const name = resources.map((x) => x.resource_id).join(", ") || r.resource_id || r.request_id;
      if (next === "active") toast.success(`${name} is active`, { description: r.summary, action: view });
      if (next === "deleted") toast.success(`${name} was deleted`, { action: view });
      if (next === "timed_out")
        toast.warning("Taking longer than expected", {
          description: `No result for ${r.request_id} after 20 minutes. Contact the platform team with this request ID.`,
          action: view,
        });
      if (next === "active" || next === "deleted") void queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    [navigate, queryClient],
  );

  /** One status lookup for a request; `force` also re-checks requests that timed out. */
  const check = useCallback(
    async (requestId: string, force = false) => {
      const r = ref.current.find((x) => x.request_id === requestId);
      if (!r || inFlight.current.has(requestId)) return;
      const deletePhase = isDeletePhase(r);
      if (!force && !isPending(r)) return;
      if (deletePhase && !r.resource_id) return; // assistant delete without a known target: the agent tracks it

      const started = deletePhase ? r.delete_requested_at! : r.submitted_at;
      if (!force && Date.now() - started > GIVE_UP_AFTER_MS) {
        update(requestId, { state: "timed_out", checked_at: Date.now() });
        announce(r, "timed_out");
        return;
      }

      inFlight.current.add(requestId);
      try {
        if (deletePhase) {
          const res = await api.status({ resource_id: r.resource_id! });
          if (!res.found) {
            update(requestId, { state: "deleted", checked_at: Date.now(), check_error: undefined });
            if (r.state !== "deleted") announce(r, "deleted");
          } else {
            update(requestId, { checked_at: Date.now(), check_error: undefined, resources: res.resources });
          }
        } else {
          const res = await api.status({ request_id: requestId });
          const active = res.resources.filter((x) => String(x.status).toUpperCase() === "ACTIVE");
          if (active.length) {
            update(requestId, {
              state: "active",
              resources: res.resources,
              resource_id: active.map((x) => x.resource_id).join(", "),
              resource_type: r.resource_type ?? String(active[0].resource_type),
              checked_at: Date.now(),
              check_error: undefined,
            });
            if (r.state !== "active") announce(r, "active", active);
          } else {
            // Records from the previous pipeline (PENDING_PROVISION) mean the config was committed.
            update(requestId, {
              resources: res.resources,
              ...(res.resources.length ? { resource_id: res.resources.map((x) => x.resource_id).join(", ") } : {}),
              checked_at: Date.now(),
              check_error: undefined,
            });
          }
        }
      } catch (err) {
        update(requestId, { checked_at: Date.now(), check_error: err instanceof ApiError ? err.message : String(err) });
      } finally {
        inFlight.current.delete(requestId);
      }
    },
    [announce, update],
  );

  // Background poller: every pending request is checked about every 15 s.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      const now = Date.now();
      for (const r of ref.current) {
        if (isPending(r) && now - (r.checked_at ?? 0) >= POLL_INTERVAL_MS) void check(r.request_id);
      }
    };
    tick();
    const t = window.setInterval(tick, 5_000);
    return () => window.clearInterval(t);
  }, [check]);

  const trackProvision = useCallback((input: NewProvision) => {
    setRequests((list) => [
      { ...input, state: input.state ?? "submitted", submitted_at: input.submitted_at ?? Date.now() },
      ...list.filter((r) => r.request_id !== input.request_id),
    ]);
  }, []);

  const trackDelete = useCallback((input: NewDelete) => {
    setRequests((list) => {
      const existing = list.find((r) => r.request_id === input.request_id);
      const entry: TrackedRequest = {
        ...(existing ?? {
          request_id: input.request_id,
          origin: input.origin ?? "registry",
          summary: input.summary ?? `Resource ${input.resource_id}`,
          submitted_at: Date.now(),
        }),
        resource_type: input.resource_type ?? existing?.resource_type,
        project: input.project ?? existing?.project,
        env: input.env ?? existing?.env,
        resource_id: input.resource_id,
        delete_ticket_id: input.delete_ticket_id,
        delete_requested_at: Date.now(),
        state: "deleting",
        checked_at: Date.now(),
        check_error: undefined,
      } as TrackedRequest;
      return [entry, ...list.filter((r) => r.request_id !== input.request_id)];
    });
  }, []);

  const get = useCallback((requestId: string) => requests.find((r) => r.request_id === requestId), [requests]);
  const checkNow = useCallback((requestId: string) => check(requestId, true), [check]);
  const remove = useCallback((requestId: string) => setRequests((list) => list.filter((r) => r.request_id !== requestId)), []);
  const clearFinished = useCallback(() => setRequests((list) => list.filter(isPending)), []);

  const sorted = useMemo(
    () =>
      [...requests].sort(
        (a, b) => (b.delete_requested_at ?? b.submitted_at) - (a.delete_requested_at ?? a.submitted_at),
      ),
    [requests],
  );
  const pendingCount = useMemo(() => requests.filter(isPending).length, [requests]);

  const value = useMemo(
    () => ({ requests: sorted, pendingCount, get, trackProvision, trackDelete, update, checkNow, remove, clearFinished }),
    [sorted, pendingCount, get, trackProvision, trackDelete, update, checkNow, remove, clearFinished],
  );
  return <RequestsContext.Provider value={value}>{children}</RequestsContext.Provider>;
}

export function useRequests() {
  const ctx = useContext(RequestsContext);
  if (!ctx) throw new Error("useRequests must be used within RequestsProvider");
  return ctx;
}
