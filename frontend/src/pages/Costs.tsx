import { useEffect, useMemo, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { ChartCard, DataTable } from "@/components/charts/ChartCard";
import { RankedList } from "@/components/charts/RankedList";
import { SpendBars } from "@/components/charts/SpendBars";
import { SampleBadge, SampleBanner, SectionError } from "@/components/common/Notices";
import { MultiSelect, formatService, useFilterOptions } from "@/components/cost/MultiSelect";
import { ReportBuilder } from "@/components/cost/ReportBuilder";
import { CostCards } from "@/components/dashboard/CostCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCostCurrent, useCostForecast } from "@/hooks/useCloud";
import { useNow } from "@/hooks/useNow";
import type { CostFilters, CostQuery, GroupBy } from "@/lib/api";
import { GROUP_BY_LABELS, TAG_GROUPINGS, dateLabel, groupKeyLabel, money, pct, timeAgo } from "@/lib/format";
import { readJson, writeJson } from "@/lib/storage";
import { cn } from "@/lib/utils";

type View = { groupBy: GroupBy; service: string[]; project: string[]; environment: string[]; excludeCredits: boolean };

const VIEW_KEY = "cb_costs_view";
const DEFAULT_VIEW: View = { groupBy: "service", service: [], project: [], environment: [], excludeCredits: false };

export default function Costs() {
  const [view, setView] = useState<View>(() => ({ ...DEFAULT_VIEW, ...readJson<Partial<View>>(VIEW_KEY, {}) }));
  useEffect(() => writeJson(VIEW_KEY, view), [view]);
  const set = <K extends keyof View>(k: K, v: View[K]) => setView((s) => ({ ...s, [k]: v }));
  const options = useFilterOptions();
  useNow(30_000);

  const filters = useMemo<CostFilters>(
    () => ({
      ...(view.service.length ? { service: view.service } : {}),
      ...(view.project.length ? { project: view.project } : {}),
      ...(view.environment.length ? { environment: view.environment } : {}),
    }),
    [view.service, view.project, view.environment],
  );
  const query = useMemo<CostQuery>(() => ({ group_by: view.groupBy, exclude_credits: view.excludeCredits, filters }), [view.groupBy, view.excludeCredits, filters]);

  const current = useCostCurrent(query);
  const forecast = useCostForecast({ exclude_credits: view.excludeCredits, filters });
  const a = current.data;
  const fetching = current.isFetching || forecast.isFetching;
  const stamps = [a?.as_of, forecast.data?.as_of].filter((s): s is string => Boolean(s)).map((s) => Date.parse(s));
  const oldest = stamps.length ? Math.min(...stamps) : null;
  const filtered = Object.keys(filters).length > 0 || view.excludeCredits;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Month-to-date spend, the month-end forecast and custom reports from AWS Cost Explorer. Figures cover complete UTC days
        (today is never included) and refresh at most hourly.
      </p>

      {/* Filters sit in one row and scope everything below them. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Select value={view.groupBy} onValueChange={(v) => set("groupBy", v as GroupBy)}>
          <SelectTrigger className="h-8 w-auto min-w-[11rem] text-sm" aria-label="Group spend by">
            <span className="text-muted-foreground">Group by:</span> <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((g) => (
              <SelectItem key={g} value={g}>
                {GROUP_BY_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelect label="Service" options={options.service} value={view.service} onChange={(v) => set("service", v)} format={formatService} />
        <MultiSelect label="Project" options={options.project} value={view.project} onChange={(v) => set("project", v)} />
        <MultiSelect label="Environment" options={options.environment} value={view.environment} onChange={(v) => set("environment", v)} />
        <label className="flex h-8 cursor-pointer items-center gap-2 px-1 text-sm">
          <input type="checkbox" checked={view.excludeCredits} onChange={(e) => set("excludeCredits", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Exclude credits
        </label>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setView({ ...DEFAULT_VIEW, groupBy: view.groupBy })}>
            Clear filters
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{oldest ? `Updated ${timeAgo(oldest)}` : ""}</span>
          <Button variant="outline" size="sm" onClick={() => (void current.refetch(), void forecast.refetch())} disabled={fetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {(a?.sample || forecast.data?.sample) && (
        <SampleBanner endpoints={[a?.sample && "GET /cost/current", forecast.data?.sample && "GET /cost/forecast"].filter((s): s is string => Boolean(s))} />
      )}

      <CostCards current={current} forecast={forecast} />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <ChartCard
          title="Daily spend this month"
          badge={a?.sample && <SampleBadge />}
          table={a?.daily.length ? <DataTable head={["Day", "Amount"]} rows={a.daily.map((d) => [dateLabel(d.date), money(d.amount, a.currency)])} /> : undefined}
        >
          {current.isLoading ? (
            <Skeleton className="h-[190px] w-full" />
          ) : current.isError && !a ? (
            <SectionError error={current.error} onRetry={() => void current.refetch()} />
          ) : a && a.daily.length ? (
            <SpendBars
              points={a.daily.map((d) => ({ key: d.date, tick: String(Number(d.date.slice(8, 10))), title: dateLabel(d.date), amount: d.amount }))}
              currency={a.currency}
              average={a.average_per_day}
              height={270}
              label="Daily spend this month"
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{a?.note ?? "No complete day yet this month."}</p>
          )}
        </ChartCard>

        <ChartCard
          title={view.groupBy === "none" ? "Breakdown" : `By ${GROUP_BY_LABELS[view.groupBy].toLowerCase()}`}
          badge={a?.sample && <SampleBadge />}
          subtitle={a && view.groupBy !== "none" ? `This month, largest first (top ${a.top.length})` : undefined}
          table={
            a?.top.length ? (
              <DataTable head={["Group", "Amount", "Share"]} rows={a.top.map((t) => [<span title={t.key}>{groupKeyLabel(t.key, a.group_by)}</span>, money(t.amount, a.currency), pct(t.pct)])} />
            ) : undefined
          }
        >
          {current.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : current.isError && !a ? (
            <SectionError error={current.error} onRetry={() => void current.refetch()} />
          ) : a ? (
            <>
              <RankedList
                items={a.top}
                groupBy={a.group_by}
                currency={a.currency}
                emptyText={view.groupBy === "none" ? "Not grouped — choose a grouping to see a breakdown." : "No spend in this period."}
              />
              {TAG_GROUPINGS.includes(view.groupBy) && (
                <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  This grouping uses resource tags that aren't all activated in AWS Billing yet, so most spend may show as “Not tagged”.
                </p>
              )}
            </>
          ) : null}
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom report</CardTitle>
          <CardDescription>Spend for any date range, grouped and filtered as you like, with CSV and HTML downloads.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportBuilder />
        </CardContent>
      </Card>
    </div>
  );
}
