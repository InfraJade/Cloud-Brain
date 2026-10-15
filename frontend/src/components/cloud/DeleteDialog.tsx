import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequests } from "@/contexts/RequestsContext";
import { ApiError, api } from "@/lib/api";
import { newDeleteTicketId } from "@/lib/validation";

export type DeleteTarget = {
  resource_id: string;
  request_id?: string;
  resource_type?: string;
  project?: string;
  env?: string;
};

/** Confirm, then DELETE /resource by resource_id (exact) with a generated delete ticket.
 *  Deletion is asynchronous: the record disappears once Terraform has destroyed the resource. */
export function DeleteDialog({
  target,
  open,
  onOpenChange,
  onDeleted,
}: {
  target: DeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (trackingId: string) => void;
}) {
  const requests = useRequests();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  if (!target) return null;
  const isS3 = String(target.resource_type).toLowerCase() === "s3";

  async function confirm() {
    if (!target) return;
    setBusy(true);
    const ticket = newDeleteTicketId();
    try {
      await api.deleteResource({
        resource_id: target.resource_id,
        delete_ticket_id: ticket,
        ...(target.resource_type ? { resource_type: target.resource_type } : {}),
        ...(target.env && target.env !== "—" ? { env: target.env } : {}),
      });
      const trackingId = target.request_id || ticket;
      requests.trackDelete({
        request_id: trackingId,
        resource_id: target.resource_id,
        delete_ticket_id: ticket,
        resource_type: target.resource_type,
        project: target.project,
        env: target.env,
        summary: `Resource ${target.resource_id}`,
      });
      toast.success("Deletion requested", { description: `${target.resource_id} disappears once Terraform has destroyed it.` });
      onOpenChange(false);
      onDeleted?.(trackingId);
    } catch (err) {
      toast.error("Delete not sent", { description: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target.resource_id}?</AlertDialogTitle>
          <AlertDialogDescription>
            This destroys the {isS3 ? "bucket" : "instance"} and its data through the Terraform pipeline. It can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isS3 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>
              <strong>Every object in the bucket is deleted too</strong> — buckets are created with force_destroy.
            </span>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="confirm-delete" className="text-sm">
            Type <span className="font-mono font-semibold">{target.resource_id}</span> to confirm
          </label>
          <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={typed !== target.resource_id || busy} onClick={() => void confirm()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
