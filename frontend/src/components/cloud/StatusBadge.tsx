import { CheckCircle2, CircleDashed, Clock, Trash2, XCircle } from "lucide-react";
import { statusMeta, type StatusTone } from "@/lib/format";
import { cn } from "@/lib/utils";

// Status colors are reserved and always ship with an icon + label (never color alone).
const TONE: Record<StatusTone, { icon: typeof Clock; color: string }> = {
  good: { icon: CheckCircle2, color: "text-status-good" },
  warning: { icon: Clock, color: "text-status-warning" },
  serious: { icon: Trash2, color: "text-status-serious" },
  critical: { icon: XCircle, color: "text-status-critical" },
  neutral: { icon: CircleDashed, color: "text-muted-foreground" },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  const { icon: Icon, color } = TONE[meta.tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium", className)}
      title={status}
    >
      <Icon className={cn("h-3.5 w-3.5", color)} aria-hidden />
      {meta.label}
    </span>
  );
}

export function ToneIcon({ tone, className }: { tone: StatusTone; className?: string }) {
  const { icon: Icon, color } = TONE[tone];
  return <Icon className={cn("h-4 w-4", color, className)} aria-hidden />;
}
