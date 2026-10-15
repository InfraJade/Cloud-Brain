import { useMemo, useState } from "react";
import { ChevronRight, Database, Search, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Resource } from "@/lib/api";
import { projectEnv, statusMeta, timeAgo } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const ALL = "__all";

export function ResourceTable({
  resources,
  loading,
  onSelect,
  emptyHint,
}: {
  resources: Resource[];
  loading: boolean;
  onSelect: (r: Resource) => void;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState(ALL);
  const [env, setEnv] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const envs = useMemo(() => [...new Set(resources.map((r) => projectEnv(r).env))].sort(), [resources]);
  const statuses = useMemo(() => [...new Set(resources.map((r) => statusMeta(r.status).label))].sort(), [resources]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources
      .filter((r) => type === ALL || String(r.resource_type).toLowerCase() === type)
      .filter((r) => env === ALL || projectEnv(r).env === env)
      .filter((r) => status === ALL || statusMeta(r.status).label === status)
      .filter(
        (r) =>
          !q ||
          [r.resource_id, r.request_id, r.project_env, r.requester_name].some((v) => String(v ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  }, [resources, query, type, env, status]);

  const filtered = query || type !== ALL || env !== ALL || status !== ALL;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resource, request, project…"
            className="pl-8"
            aria-label="Search resources"
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[7.5rem]" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="ec2">EC2</SelectItem>
            <SelectItem value="s3">S3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={env} onValueChange={setEnv}>
          <SelectTrigger className="w-[7.5rem]" aria-label="Filter by environment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All envs</SelectItem>
            {envs.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[8.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Env</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Requester</TableHead>
              <TableHead className="hidden md:table-cell">Updated</TableHead>
              <TableHead className="w-8">
                <span className="sr-only">Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading &&
              rows.map((r) => {
                const pe = projectEnv(r);
                const isS3 = String(r.resource_type).toLowerCase() === "s3";
                return (
                  <TableRow
                    key={`${r.request_id}-${r.resource_id}`}
                    tabIndex={0}
                    onClick={() => onSelect(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(r);
                      }
                    }}
                    className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {isS3 ? (
                          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[13px] font-medium">{r.resource_id}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{r.request_id}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-semibold uppercase">{String(r.resource_type)}</TableCell>
                    <TableCell className="text-sm">{pe.project}</TableCell>
                    <TableCell className="text-sm">{pe.env}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{r.requester_name || "—"}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell" title={String(r.updated_at ?? "")}>
                      {timeAgo(r.updated_at)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-sm text-muted-foreground">
                  {filtered ? "No resources match these filters." : emptyHint || "No resources provisioned yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!loading && resources.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {resources.length} resource{resources.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
