import { ToneIcon } from "@/components/cloud/StatusBadge";
import { requestStateMeta, type TrackedRequest } from "@/contexts/RequestsContext";
import { cn } from "@/lib/utils";

export function RequestBadge({ request, className }: { request: TrackedRequest; className?: string }) {
  const meta = requestStateMeta(request);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium", className)}>
      <ToneIcon tone={meta.tone} className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
