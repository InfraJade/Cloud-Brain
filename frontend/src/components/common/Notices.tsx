import { useId, type ReactNode } from "react";
import { AlertTriangle, FlaskConical, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function listJoin(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Shown wherever example data stands in for endpoints that aren't deployed yet. */
export function SampleBanner({ endpoints, className }: { endpoints: string[]; className?: string }) {
  return (
    <div role="note" className={cn("flex items-start gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3.5 text-sm", className)}>
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
      <div>
        <span className="font-semibold">Sample data.</span>{" "}
        <span className="text-muted-foreground">
          {listJoin(endpoints)} {endpoints.length > 1 ? "aren't" : "isn't"} deployed on AWS yet, so these are the example
          numbers from the backend spec. Real figures replace them automatically once the backend owner deploys{" "}
          {endpoints.length > 1 ? "them" : "it"}.
        </span>
      </div>
    </div>
  );
}

export function SampleBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300", className)}>
      <FlaskConical className="h-3 w-3" aria-hidden /> Sample
    </span>
  );
}

/** What to tell the user for each failure (spec §2, Errors). */
export function describeError(error: unknown): { title: string; detail: string; retry: boolean } {
  const e = error instanceof ApiError ? error : null;
  const status = e?.status ?? -1;
  if (e?.notDeployed || status === 404) return { title: "Not available yet", detail: e?.message ?? "This endpoint isn't deployed yet.", retry: false };
  if (status === 403) return { title: "Not available", detail: "The backend's AWS role is missing a permission. Please tell the backend owner.", retry: false };
  if (status === 400) return { title: "Request rejected", detail: e!.message, retry: false };
  if (status === 429) return { title: "AWS is busy", detail: "Cost Explorer is rate-limiting requests. Try again in a few seconds.", retry: true };
  if (status === 503 || status === 504) return { title: "Timed out", detail: "AWS took too long to answer.", retry: true };
  if (status === 0) return { title: "Can't reach the server", detail: "The CLOUD BRAIN backend isn't responding.", retry: true };
  return { title: "Something went wrong", detail: e?.message ?? (error as Error)?.message ?? "Unexpected error.", retry: true };
}

export function SectionError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { title, detail, retry } = describeError(error);
  const offline = error instanceof ApiError && error.status === 0;
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 text-sm", className)}>
      <div className="flex items-center gap-2 font-medium">
        {offline ? <WifiOff className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-status-warning" />}
        {title}
      </div>
      <p className="text-muted-foreground">{detail}</p>
      {retry && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

/** Small hover/focus tooltip for extra detail (e.g. which regions failed). */
export function InfoTip({ label, children, trigger, className }: { label: string; children: ReactNode; trigger: ReactNode; className?: string }) {
  const id = useId();
  return (
    <span className={cn("group relative inline-flex", className)}>
      <button type="button" aria-label={label} aria-describedby={id} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {trigger}
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-30 mt-1.5 w-64 rounded-md border bg-popover p-2.5 text-left text-xs text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
