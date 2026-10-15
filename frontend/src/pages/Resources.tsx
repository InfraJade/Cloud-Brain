import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { ResourceSheet } from "@/components/cloud/ResourceSheet";
import { ResourceTable } from "@/components/cloud/ResourceTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useResources } from "@/hooks/useCloud";
import type { Resource } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Everything this platform has created — the aws-ops-resources registry. */
export default function Resources() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt, error } = useResources();
  const [selected, setSelected] = useState<Resource | null>(null);
  const [params, setParams] = useSearchParams();
  const unavailable = data && data.source !== "dynamodb";

  // ?focus=<resource_id> opens that resource (used by the assistant's "Use the form" shortcut).
  const focus = params.get("focus");
  useEffect(() => {
    if (!focus || !data) return;
    const match = data.resources.find((r) => r.resource_id === focus);
    if (match) setSelected(match);
    setParams((p) => {
      p.delete("focus");
      return p;
    }, { replace: true });
  }, [focus, data, setParams]);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Platform resources</CardTitle>
          <CardDescription>
            EC2 instances and S3 buckets created through Cloud Brain, from the resource registry. A record appears once Terraform
            has created the resource and disappears once it's destroyed.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{dataUpdatedAt ? `Updated ${timeAgo(dataUpdatedAt)}` : ""}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" asChild>
            <Link to="/provision">
              <Plus className="h-3.5 w-3.5" /> Request a resource
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            {(error as Error).message}
          </div>
        )}
        {unavailable && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
            {data?.message}
          </div>
        )}
        <div className={cn("transition-opacity", isFetching && !isLoading && "opacity-70")}>
          <ResourceTable resources={data?.resources ?? []} loading={isLoading} onSelect={setSelected} emptyHint="No resources yet — request one, or ask the Assistant." />
        </div>
      </CardContent>

      <ResourceSheet resource={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
