import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { isDeletePhase, type TrackedRequest } from "@/contexts/RequestsContext";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type StepState = "done" | "current" | "todo" | "failed" | "late";
type Step = { title: string; detail: string; state: StepState };

/** The request lifecycle (spec §6): Submitted → Config committed → ACTIVE → Delete requested → Removed. */
function stepsFor(r: TrackedRequest): Step[] {
  const s = r.state;
  const deletePhase = isDeletePhase(r);
  const building: StepState =
    s === "failed" && !deletePhase ? "failed" : s === "timed_out" && !deletePhase ? "late" : s === "submitted" || s === "committed" ? "current" : "done";
  const steps: Step[] = [
    { title: "Submitted", detail: `Accepted ${timeAgo(r.submitted_at)}`, state: "done" },
    {
      title: "Building",
      detail:
        building === "failed"
          ? "The workflow failed."
          : building === "late"
            ? "No record after 20 minutes."
            : s === "committed"
              ? "Configuration committed — Terraform is creating the resource."
              : "Terraform file committed to the GitOps repo and applied by CodeBuild.",
      state: building,
    },
    {
      title: "Active",
      detail: r.resource_id && building === "done" ? `${r.resource_id} is running.` : "The resource exists once its ACTIVE record appears.",
      state: building === "done" ? "done" : "todo",
    },
  ];
  if (deletePhase) {
    steps.push(
      { title: "Delete requested", detail: `Requested ${timeAgo(r.delete_requested_at!)}${r.delete_ticket_id ? ` · ticket ${r.delete_ticket_id}` : ""}`, state: "done" },
      {
        title: "Destroying",
        detail: s === "timed_out" ? "Still in the registry after 20 minutes." : s === "failed" ? "The deletion failed." : "Terraform is destroying the resource.",
        state: s === "deleting" ? "current" : s === "timed_out" ? "late" : s === "failed" ? "failed" : "done",
      },
      { title: "Removed", detail: "The record disappears once the resource is gone.", state: s === "deleted" ? "done" : "todo" },
    );
  }
  return steps;
}

const ICON: Record<StepState, typeof Circle> = {
  done: CheckCircle2,
  current: Loader2,
  todo: Circle,
  failed: XCircle,
  late: AlertTriangle,
};

const COLOR: Record<StepState, string> = {
  done: "text-status-good",
  current: "text-primary animate-spin",
  todo: "text-muted-foreground/50",
  failed: "text-status-critical",
  late: "text-status-warning",
};

export function RequestTimeline({ request }: { request: TrackedRequest }) {
  const steps = stepsFor(request);
  return (
    <ol className="relative space-y-5" aria-label="Request progress">
      {steps.map((step, i) => {
        const Icon = ICON[step.state];
        return (
          <li key={step.title} className="relative flex gap-3">
            {i < steps.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%+0.25rem)] w-px bg-border" aria-hidden />}
            <Icon className={cn("relative z-10 mt-0.5 h-5 w-5 shrink-0 rounded-full bg-card", COLOR[step.state])} aria-hidden />
            <div>
              <div className={cn("text-sm font-medium", step.state === "todo" && "text-muted-foreground")}>
                {step.title}
                <span className="sr-only"> — {step.state === "current" ? "in progress" : step.state}</span>
              </div>
              <div className="text-xs text-muted-foreground">{step.detail}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
