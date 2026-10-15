import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Live CLOUD BRAIN server status (unauthenticated /api/healthz), polled every 20s. */
export function ServiceStatus({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 20_000,
    retry: false,
  });

  const state = isLoading ? "checking" : isError || data?.status !== "ok" ? "down" : "up";
  const label = state === "checking" ? "Checking server…" : state === "up" ? "All systems online" : "Server unreachable";
  const dot = state === "up" ? "bg-[#0ca30c]" : state === "down" ? "bg-[#d03b3b]" : "bg-[#fab219]";

  return (
    <div
      className={cn("glass-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-foreground", className)}
      role="status"
      title={state === "down" ? "Start the backend: uvicorn backend.main:app --port 8080" : undefined}
    >
      <span className="relative flex h-2 w-2">
        {state === "up" && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dot)} />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", dot)} />
      </span>
      {label}
    </div>
  );
}
