import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, Archive, Container, Database, Globe, Server, Ship, SquareFunction, Table2, type LucideIcon } from "lucide-react";
import { InfoTip, SectionError } from "@/components/common/Notices";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { InventoryResponse, ServiceCount, ServiceKey } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";

const META: Record<ServiceKey, { short: string; icon: LucideIcon }> = {
  ec2: { short: "EC2", icon: Server },
  rds: { short: "RDS", icon: Database },
  eks: { short: "EKS", icon: Ship },
  ecs: { short: "ECS", icon: Container },
  lambda: { short: "Lambda", icon: SquareFunction },
  dynamodb: { short: "DynamoDB", icon: Table2 },
  s3: { short: "S3", icon: Archive },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const intFmt = (n: number) => String(Math.round(n));

/** Detail lines per service (spec §4.1: keys are fixed per service, zero when empty). */
function detailLines(s: ServiceCount): string[] {
  const d = s.details ?? {};
  const n = (k: string) => d[k] ?? 0;
  switch (s.key) {
    case "rds":
      return [`${n("available")} available`, `${n("stopped")} stopped${n("other") ? ` · ${n("other")} other` : ""}`];
    case "ecs":
      return [plural(n("services"), "service", "services"), `${n("running_tasks")} running tasks${n("pending_tasks") ? ` · ${n("pending_tasks")} pending` : ""}`];
    case "eks":
      return [s.count === 1 ? "cluster" : "clusters"];
    case "lambda":
      return [s.count === 1 ? "function" : "functions"];
    case "dynamodb":
      return [s.count === 1 ? "table" : "tables"];
    case "s3":
      return [s.count === 1 ? "bucket" : "buckets"];
    default:
      return [];
  }
}

function TileTop({ service, errors }: { service: ServiceCount; errors: InventoryResponse["errors"] }) {
  const meta = META[service.key];
  const mine = errors.filter((e) => e.service === service.key);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="icon-chip flex h-9 w-9 items-center justify-center rounded-xl text-primary">
          <meta.icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="text-sm font-semibold" title={service.label}>
          {meta.short}
        </span>
      </div>
      {!service.complete && (
        <InfoTip label={`${meta.short} count is incomplete`} trigger={<AlertTriangle className="h-4 w-4 text-status-warning" aria-hidden />}>
          <div className="mb-1 font-semibold">Count covers only the regions that worked</div>
          <ul className="space-y-1">
            {mine.length ? (
              mine.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.region}</span>: {e.error}
                </li>
              ))
            ) : (
              <li>Some regions couldn't be read.</li>
            )}
          </ul>
        </InfoTip>
      )}
    </div>
  );
}

/** EC2 gets the wide tile: instance states as a labelled bar. */
function Ec2Tile({ service, errors, delay }: { service: ServiceCount; errors: InventoryResponse["errors"]; delay: number }) {
  const d = service.details ?? {};
  const parts = [
    { key: "running", label: "running", value: d.running ?? 0, cls: "bg-status-good" },
    { key: "stopped", label: "stopped", value: d.stopped ?? 0, cls: "bg-muted-foreground/45" },
    { key: "other", label: "other", value: d.other ?? 0, cls: "bg-status-warning" },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <Card className="lift animate-rise col-span-2 overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="flex h-full flex-col p-5">
        <TileTop service={service} errors={errors} />
        <div className="mt-3 flex items-end justify-between gap-3">
          <CountUp value={service.count} format={intFmt} className="tabular font-display text-4xl font-semibold tracking-tight" />
          <span className="pb-1 text-xs text-muted-foreground">{d.chatops_managed ?? 0} ChatOps-managed</span>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((p) => `${p.value} ${p.label}`).join(", ")}>
            {total > 0 &&
              parts
                .filter((p) => p.value > 0)
                .map((p) => <div key={p.key} className={cn("h-full", p.cls)} style={{ flexGrow: p.value, flexBasis: 0 }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {parts.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", p.cls)} aria-hidden />
                <span className="tabular font-medium text-foreground">{p.value}</span> {p.label}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({ service, errors, delay }: { service: ServiceCount; errors: InventoryResponse["errors"]; delay: number }) {
  return (
    <Card className="lift animate-rise min-w-0 overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="flex h-full flex-col p-5">
        <TileTop service={service} errors={errors} />
        <CountUp value={service.count} format={intFmt} className="tabular mt-3 block font-display text-3xl font-semibold tracking-tight" />
        <div className="mt-1 space-y-0.5">
          {detailLines(service).map((line) => (
            <div key={line} className="text-xs leading-snug text-muted-foreground">
              {line}
            </div>
          ))}
          {service.scope === "global" && (
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" aria-hidden /> all regions
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The seven service tiles as a bento grid, in the order the API returns them; zero is shown, never hidden. */
export function ServiceTiles({ query }: { query: UseQueryResult<InventoryResponse> }) {
  const data = query.data;
  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Skeleton className="col-span-2 h-[150px] rounded-2xl" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px] rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.isError && !data) return <SectionError error={query.error} onRetry={() => void query.refetch()} />;
  if (!data) return null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.services.map((s, i) =>
          s.key === "ec2" ? (
            <Ec2Tile key={s.key} service={s} errors={data.errors} delay={240 + i * 50} />
          ) : (
            <Tile key={s.key} service={s} errors={data.errors} delay={240 + i * 50} />
          ),
        )}
      </div>
      {data.partial && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-status-warning" aria-hidden />
          Some services or regions couldn't be read — the counts cover only what worked.
        </p>
      )}
    </div>
  );
}
