import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, ChevronRight, FileInput, Search, Server } from "lucide-react";
import { RequestBadge } from "@/components/requests/RequestBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isPending, useRequests, type TrackedRequest } from "@/contexts/RequestsContext";
import { useNow } from "@/hooks/useNow";
import { timeAgo } from "@/lib/format";
import { REQUEST_ID_RE } from "@/lib/validation";

const ORIGIN = {
  form: { label: "Form", icon: FileInput },
  assistant: { label: "Assistant", icon: Bot },
  registry: { label: "Looked up", icon: Server },
} as const;

function Row({ r }: { r: TrackedRequest }) {
  const origin = ORIGIN[r.origin];
  const when = r.delete_requested_at ?? r.submitted_at;
  return (
    <li>
      <Link to={`/requests/${encodeURIComponent(r.request_id)}`} className="flex items-center gap-3 px-1 py-3 transition-colors hover:bg-muted/50 sm:px-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{r.request_id}</span>
            <RequestBadge request={r} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{r.summary}</span>
            {r.resource_id && <span className="font-mono">{r.resource_id}</span>}
            <span className="inline-flex items-center gap-1">
              <origin.icon className="h-3.5 w-3.5" aria-hidden /> {origin.label}
            </span>
            <span>{r.delete_requested_at ? "delete requested" : "submitted"} {timeAgo(when)}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export default function Requests() {
  const { requests, clearFinished } = useRequests();
  const navigate = useNavigate();
  const [lookup, setLookup] = useState("");
  useNow(30_000);
  const pending = requests.filter(isPending);
  const finished = requests.filter((r) => !isPending(r));
  const lookupValid = REQUEST_ID_RE.test(lookup.trim());

  function go(e: FormEvent) {
    e.preventDefault();
    if (lookupValid) navigate(`/requests/${encodeURIComponent(lookup.trim())}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={go} className="flex flex-wrap items-center gap-2" role="search" aria-label="Track a request">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Track a request ID, e.g. UI-7F3K9Q2M1A" className="pl-8 font-mono" aria-label="Request ID" />
            </div>
            <Button type="submit" disabled={!lookupValid}>
              Track
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Your requests</CardTitle>
            <CardDescription>
              Requests made from this browser. AWS runs them asynchronously: pending ones are checked every 15 seconds for up to
              20 minutes.
            </CardDescription>
          </div>
          {finished.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFinished}>
              Clear finished
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-muted-foreground">
              No requests yet.
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link to="/provision">Request a resource</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/assistant">Ask the assistant</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {pending.length > 0 && (
                <section aria-label="In progress">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">In progress</h3>
                  <ul className="divide-y">{pending.map((r) => <Row key={r.request_id} r={r} />)}</ul>
                </section>
              )}
              {finished.length > 0 && (
                <section aria-label="Finished">
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finished</h3>
                  <ul className="divide-y">{finished.map((r) => <Row key={r.request_id} r={r} />)}</ul>
                </section>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
