import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Copy, Database, Eye, Loader2, RefreshCw, Rocket, Server, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DeleteDialog, type DeleteTarget } from "@/components/cloud/DeleteDialog";
import { StatusBadge } from "@/components/cloud/StatusBadge";
import { SectionError } from "@/components/common/Notices";
import { RequestBadge } from "@/components/requests/RequestBadge";
import { RequestTimeline } from "@/components/requests/RequestTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { GIVE_UP_AFTER_MS, POLL_INTERVAL_MS, isDeletePhase, isPending, useRequests, type TrackedRequest } from "@/contexts/RequestsContext";
import { useNow } from "@/hooks/useNow";
import { api, type Resource } from "@/lib/api";
import { formatDateTime, formatDuration, projectEnv, resourceTypeLabel, timeAgo } from "@/lib/format";
import { REQUEST_ID_RE, osLabel } from "@/lib/validation";

function CopyId({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label="Copy request ID"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        toast.success("Request ID copied");
      }}
    >
      <Copy className="h-4 w-4" />
    </button>
  );
}

function ResourceRows({ resources, onDelete, canDelete }: { resources: Resource[]; onDelete: (t: DeleteTarget) => void; canDelete: boolean }) {
  return (
    <ul className="divide-y rounded-lg border">
      {resources.map((r) => {
        const pe = projectEnv(r);
        const isS3 = String(r.resource_type).toLowerCase() === "s3";
        return (
          <li key={r.resource_id} className="flex flex-wrap items-center gap-3 p-3">
            {isS3 ? <Database className="h-5 w-5 text-muted-foreground" /> : <Server className="h-5 w-5 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm font-medium">{r.resource_id}</div>
              <div className="text-xs text-muted-foreground">
                {resourceTypeLabel(String(r.resource_type))} · {pe.project} · {pe.env} · {r.requester_name ?? "unknown"} · updated {timeAgo(r.updated_at)}
              </div>
            </div>
            <StatusBadge status={r.status} />
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => onDelete({ resource_id: r.resource_id, request_id: r.request_id, resource_type: String(r.resource_type), project: pe.project, env: pe.env })}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Outcome({ request }: { request: TrackedRequest }) {
  if (request.state === "timed_out") {
    const del = isDeletePhase(request);
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden />
        <div>
          <div className="font-semibold">This is taking longer than expected.</div>
          <p className="mt-1 text-muted-foreground">
            {del ? "The resource is still in the registry after 20 minutes." : "No record has appeared after 20 minutes — the request may still be running, or it may have failed (failures aren't reported back yet)."}{" "}
            Contact the platform team with request ID <span className="font-mono font-semibold text-foreground">{request.request_id}</span>
            {del && request.delete_ticket_id ? (
              <>
                {" "}and delete ticket <span className="font-mono font-semibold text-foreground">{request.delete_ticket_id}</span>
              </>
            ) : null}
            .
          </p>
        </div>
      </div>
    );
  }
  if (request.state === "failed") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold">The request failed{request.error ? `: ${request.error}` : "."}</div>
          {request.origin === "assistant" && (
            <p className="mt-1 text-muted-foreground">
              Changes proposed in chat currently fail on the backend (a known issue). Use the{" "}
              <Link to="/provision" className="font-medium text-primary underline-offset-2 hover:underline">
                Provision form
              </Link>{" "}
              for real changes.
            </p>
          )}
          {request.cause && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">Technical details</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-card p-2 font-mono text-[11px]">{request.cause}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default function RequestTracker() {
  const params = useParams();
  const id = decodeURIComponent(params.requestId ?? "");
  const requests = useRequests();
  const entry = requests.get(id);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [checking, setChecking] = useState(false);
  const validId = REQUEST_ID_RE.test(id);
  const pending = entry ? isPending(entry) : false;
  const now = useNow(1000, pending);

  // A request this browser doesn't know (opened from a link): look it up once.
  const lookup = useQuery({
    queryKey: ["status", id],
    queryFn: () => api.status({ request_id: id }),
    enabled: !entry && validId,
  });

  async function checkNow() {
    setChecking(true);
    try {
      await requests.checkNow(id);
    } finally {
      setChecking(false);
    }
  }

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/requests">
        <ArrowLeft className="h-3.5 w-3.5" /> All requests
      </Link>
    </Button>
  );

  if (!validId) {
    return (
      <div className="space-y-4">
        {back}
        <SectionError error={new Error("That isn't a valid request ID (3–64 characters from A–Z, a–z, 0–9 and . _ : -).")} />
      </div>
    );
  }

  if (!entry) {
    const found = lookup.data?.resources ?? [];
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-lg">
              {id} <CopyId value={id} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lookup.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : lookup.isError ? (
              <SectionError error={lookup.error} onRetry={() => void lookup.refetch()} />
            ) : found.length ? (
              <>
                <p className="text-sm text-muted-foreground">This request created the resource{found.length > 1 ? "s" : ""} below.</p>
                <ResourceRows resources={found} canDelete={isAdmin} onDelete={setDeleteTarget} />
                <Button
                  variant="outline"
                  onClick={() => {
                    const active = found.filter((r) => String(r.status).toUpperCase() === "ACTIVE");
                    requests.trackProvision({
                      request_id: id,
                      origin: "registry",
                      summary: `${resourceTypeLabel(String(found[0].resource_type))} ${found[0].resource_id}`,
                      resource_type: String(found[0].resource_type),
                      project: projectEnv(found[0]).project,
                      env: projectEnv(found[0]).env,
                      resources: found,
                      resource_id: found.map((r) => r.resource_id).join(", "),
                      state: active.length ? "active" : "submitted",
                    });
                  }}
                >
                  <Eye className="h-4 w-4" /> Track this request
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No record for this request yet. It may still be being created, it may have failed, or it may already have been deleted —
                  the backend can't tell these apart yet.
                </p>
                <Button
                  variant="outline"
                  onClick={() => requests.trackProvision({ request_id: id, origin: "registry", summary: `Request ${id}` })}
                >
                  <Eye className="h-4 w-4" /> Watch it for 20 minutes
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <DeleteDialog
          target={deleteTarget}
          open={Boolean(deleteTarget)}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        />
      </div>
    );
  }

  const deletePhase = isDeletePhase(entry);
  const started = deletePhase ? entry.delete_requested_at! : entry.submitted_at;
  const elapsed = now - started;
  const resources = entry.resources ?? [];
  const activeResources = resources.filter((r) => String(r.status).toUpperCase() === "ACTIVE");
  const canDelete = isAdmin && entry.state === "active";

  const details: [string, string | undefined][] = [
    ["Type", entry.resource_type ? resourceTypeLabel(entry.resource_type) : undefined],
    ["Project", entry.project],
    ["Environment", entry.env],
    ["Instance type", entry.instance_type],
    ["Operating system", entry.os_name ? osLabel(entry.os_name) : undefined],
    ["Submitted", formatDateTime(entry.submitted_at)],
    ["Source", entry.origin === "form" ? "Provision form" : entry.origin === "assistant" ? "Assistant" : "Looked up"],
    ["Delete ticket", entry.delete_ticket_id],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {back}
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="flex items-center gap-1 font-mono text-lg">
              {entry.request_id} <CopyId value={entry.request_id} />
            </CardTitle>
            <RequestBadge request={entry} />
          </div>
          <p className="text-sm text-muted-foreground">{entry.summary}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {pending && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/60 px-4 py-3 text-sm" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
              <span className="font-medium">{deletePhase ? "Deleting…" : "Creating…"}</span>
              <span className="text-muted-foreground">
                Checking every {POLL_INTERVAL_MS / 1000} s · {formatDuration(elapsed)} elapsed · gives up after {GIVE_UP_AFTER_MS / 60_000} min
                {entry.checked_at ? ` · last checked ${timeAgo(entry.checked_at)}` : ""}
              </span>
            </div>
          )}
          {entry.check_error && (
            <p className="flex items-center gap-2 text-sm text-status-warning">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Last check failed: {entry.check_error}
            </p>
          )}

          <Outcome request={entry} />

          {entry.state === "active" && activeResources.length > 0 && (
            <section className="space-y-2" aria-label="Created resources">
              <h3 className="text-sm font-semibold">Created</h3>
              <ResourceRows resources={activeResources} canDelete={canDelete} onDelete={setDeleteTarget} />
              {!isAdmin && <p className="text-xs text-muted-foreground">Only admins can delete resources.</p>}
            </section>
          )}
          {entry.state === "deleted" && (
            <p className="rounded-lg border bg-muted/40 p-4 text-sm">
              <span className="font-semibold">{entry.resource_id}</span> has been destroyed and its record removed.
            </p>
          )}
          {!activeResources.length && resources.length > 0 && entry.state !== "deleted" && (
            <section className="space-y-2" aria-label="Registry records">
              <h3 className="text-sm font-semibold">Registry records</h3>
              <ResourceRows resources={resources} canDelete={false} onDelete={setDeleteTarget} />
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section aria-label="Progress">
              <h3 className="mb-3 text-sm font-semibold">Progress</h3>
              <RequestTimeline request={entry} />
            </section>
            <section aria-label="Details">
              <h3 className="mb-3 text-sm font-semibold">Details</h3>
              <dl className="divide-y rounded-lg border text-sm">
                {details
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => void checkNow()} disabled={checking}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check now
            </Button>
            {(entry.state === "failed" || entry.state === "timed_out") && !deletePhase && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/provision">
                  <Rocket className="h-3.5 w-3.5" /> New request
                </Link>
              </Button>
            )}
            {!pending && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  requests.remove(entry.request_id);
                  navigate("/requests");
                }}
              >
                Remove from my list
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <DeleteDialog target={deleteTarget} open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)} />
    </div>
  );
}
