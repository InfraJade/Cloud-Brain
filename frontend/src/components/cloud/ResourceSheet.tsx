import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Database, ListChecks, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useRequests } from "@/contexts/RequestsContext";
import type { Resource } from "@/lib/api";
import { formatDateTime, projectEnv, resourceTypeLabel, titleCase } from "@/lib/format";
import { DeleteDialog } from "./DeleteDialog";
import { StatusBadge } from "./StatusBadge";

const KNOWN = ["resource_id", "request_id", "resource_type", "status", "project_env", "requester_name", "approver_name", "updated_at"];

function Field({ label, value, mono, copy }: { label: string; value: string; mono?: boolean; copy?: boolean }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-start gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`flex min-w-0 items-center gap-1.5 ${mono ? "font-mono text-[13px]" : ""}`}>
        <span className="break-all">{value || "—"}</span>
        {copy && value && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Copy ${label}`}
            onClick={() => {
              void navigator.clipboard?.writeText(value);
              toast.success(`${label} copied`);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </dd>
    </div>
  );
}

export function ResourceSheet({ resource, onClose }: { resource: Resource | null; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const requests = useRequests();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const r = resource;
  const pe = r ? projectEnv(r) : null;
  const extra = r ? Object.entries(r).filter(([k, v]) => !KNOWN.includes(k) && v !== null && v !== undefined && v !== "") : [];
  const deleting = r ? requests.requests.some((x) => x.state === "deleting" && x.resource_id === r.resource_id) : false;

  return (
    <>
      <Sheet open={!!r && !confirmOpen} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          {r && pe && (
            <>
              <SheetHeader className="space-y-3 border-b pb-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    {String(r.resource_type).toLowerCase() === "s3" ? <Database className="h-5 w-5" /> : <Server className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <SheetTitle className="truncate font-mono text-base">{r.resource_id}</SheetTitle>
                    <SheetDescription>{resourceTypeLabel(String(r.resource_type))}</SheetDescription>
                  </div>
                </div>
                <StatusBadge status={r.status} className="self-start" />
              </SheetHeader>

              <dl className="divide-y py-2">
                <Field label="Resource" value={r.resource_id} mono copy />
                <Field label="Request ID" value={r.request_id} mono copy />
                <Field label="Project" value={pe.project} />
                <Field label="Environment" value={pe.env} />
                <Field label="Status" value={r.status} mono />
                <Field label="Requested by" value={r.requester_name ?? ""} />
                {r.approver_name && <Field label="Approved by" value={r.approver_name} />}
                <Field label="Updated (UTC)" value={formatDateTime(r.updated_at)} />
                {extra.map(([k, v]) => (
                  <Field key={k} label={titleCase(k)} value={typeof v === "object" ? JSON.stringify(v) : String(v)} mono />
                ))}
              </dl>

              <div className="mt-auto space-y-2 border-t pt-4">
                {r.request_id && (
                  <Button variant="outline" className="w-full" asChild>
                    <Link to={`/requests/${encodeURIComponent(r.request_id)}`}>
                      <ListChecks className="h-4 w-4" /> Open request tracker
                    </Link>
                  </Button>
                )}
                {deleting ? (
                  <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">A deletion for this resource is in progress.</p>
                ) : isAdmin ? (
                  <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4" /> Delete resource
                  </Button>
                ) : (
                  <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    Only admins can delete resources. Ask a CLOUD BRAIN admin if this one should be removed.
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <DeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        target={r && pe ? { resource_id: r.resource_id, request_id: r.request_id, resource_type: String(r.resource_type), project: pe.project, env: pe.env } : null}
        onDeleted={(id) => {
          onClose();
          navigate(`/requests/${encodeURIComponent(id)}`);
        }}
      />
    </>
  );
}
