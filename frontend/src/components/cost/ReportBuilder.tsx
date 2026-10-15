import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, ExternalLink, FileBarChart2, Info, Loader2 } from "lucide-react";
import { ChartCard, DataTable } from "@/components/charts/ChartCard";
import { RankedList } from "@/components/charts/RankedList";
import { SpendBars } from "@/components/charts/SpendBars";
import { SampleBanner, SectionError } from "@/components/common/Notices";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api, type GroupBy, type ReportPeriod, type ReportRequest, type ReportResponse } from "@/lib/api";
import {
  GROUP_BY_LABELS,
  TAG_GROUPINGS,
  addDaysUtc,
  dateLabel,
  daysBetweenInclusive,
  groupKeyLabel,
  money,
  pct,
  periodLabel,
  shortMonthLabel,
  yesterdayUtc,
} from "@/lib/format";
import { sampleReport } from "@/lib/sampleData";
import { readJson, writeJson } from "@/lib/storage";
import { DATE_RE } from "@/lib/validation";
import { MultiSelect, formatService, useFilterOptions } from "./MultiSelect";

type Range = ReportPeriod | "custom";

const RANGES: { value: Range; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

/** Group-by choices offered in the report dialog (spec §5.4). */
const REPORT_GROUPS: GroupBy[] = ["service", "region", "usage_type", "account", "instance_type", "project", "owner", "ticket", "environment", "none"];

type Options = {
  range: Range;
  start: string;
  end: string;
  groupBy: GroupBy;
  granularity: "DAILY" | "MONTHLY";
  project: string[];
  environment: string[];
  service: string[];
  excludeCredits: boolean;
};

const OPTIONS_KEY = "cb_report_options";
const MAX_DAILY_DAYS = 366;

function defaults(): Options {
  const y = yesterdayUtc();
  return { range: "last_month", start: addDaysUtc(y, -29), end: y, groupBy: "service", granularity: "DAILY", project: [], environment: [], service: [], excludeCredits: false };
}

/** Earliest date Cost Explorer normally keeps (~13 months). */
function historyStart() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 13, 1);
  return d.toISOString().slice(0, 10);
}

async function generate(body: ReportRequest): Promise<ReportResponse> {
  try {
    return await api.costReport(body);
  } catch (err) {
    if (err instanceof ApiError && err.notDeployed) return sampleReport(body);
    if (err instanceof ApiError && err.status === 429) {
      await new Promise((r) => setTimeout(r, 3000)); // AWS rate limit: retry once after a few seconds
      return api.costReport(body);
    }
    throw err;
  }
}

export function ReportBuilder({ compact = false }: { compact?: boolean }) {
  const [opts, setOpts] = useState<Options>(() => ({ ...defaults(), ...readJson<Partial<Options>>(OPTIONS_KEY, {}) }));
  const filterOptions = useFilterOptions();
  const mutation = useMutation({ mutationFn: generate });
  const report = mutation.data;

  // Remember report options locally (spec §10).
  useEffect(() => writeJson(OPTIONS_KEY, opts), [opts]);

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const yesterday = yesterdayUtc();
  const minDate = historyStart();

  const customDays = useMemo(
    () => (DATE_RE.test(opts.start) && DATE_RE.test(opts.end) && opts.start <= opts.end ? daysBetweenInclusive(opts.start, opts.end) : 0),
    [opts.start, opts.end],
  );
  const forceMonthly = opts.range === "custom" && customDays > MAX_DAILY_DAYS;
  useEffect(() => {
    if (forceMonthly && opts.granularity === "DAILY") set("granularity", "MONTHLY");
  }, [forceMonthly, opts.granularity]);

  let rangeError: string | null = null;
  if (opts.range === "custom") {
    if (!DATE_RE.test(opts.start) || !DATE_RE.test(opts.end)) rangeError = "Pick a start and an end date.";
    else if (opts.start > opts.end) rangeError = "The start date must be on or before the end date.";
    else if (opts.end > yesterday) rangeError = `The latest date with complete figures is yesterday (${dateLabel(yesterday)}, UTC).`;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (rangeError) return;
    const body: ReportRequest = {
      ...(opts.range === "custom" ? { start_date: opts.start, end_date: opts.end } : { period: opts.range }),
      group_by: opts.groupBy,
      granularity: forceMonthly ? "MONTHLY" : opts.granularity,
      ...(opts.excludeCredits ? { exclude_credits: true } : {}),
      ...(opts.project.length ? { project: opts.project } : {}),
      ...(opts.environment.length ? { environment: opts.environment } : {}),
      ...(opts.service.length ? { service: opts.service } : {}),
    };
    mutation.mutate(body);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4" aria-label="Cost report options">
        <div className={compact ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
          <div className="space-y-1.5">
            <Label>Range</Label>
            <Select value={opts.range} onValueChange={(v) => set("range", v as Range)}>
              <SelectTrigger aria-label="Range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Group by</Label>
            <Select value={opts.groupBy} onValueChange={(v) => set("groupBy", v as GroupBy)}>
              <SelectTrigger aria-label="Group by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GROUP_BY_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Granularity</Label>
            <div className="inline-flex w-full rounded-lg border bg-muted p-1" role="radiogroup" aria-label="Granularity">
              {(["DAILY", "MONTHLY"] as const).map((g) => {
                const disabled = g === "DAILY" && forceMonthly;
                const checked = (forceMonthly ? "MONTHLY" : opts.granularity) === g;
                return (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => set("granularity", g)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {g === "DAILY" ? "Daily" : "Monthly"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={opts.excludeCredits} onChange={(e) => set("excludeCredits", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              Exclude credits and refunds
            </label>
          </div>
        </div>

        {opts.range === "custom" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="report-start">Start date</Label>
              <input id="report-start" type="date" value={opts.start} min={minDate} max={yesterday} onChange={(e) => set("start", e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-end">End date</Label>
              <input id="report-end" type="date" value={opts.end} min={minDate} max={yesterday} onChange={(e) => set("end", e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Dates are UTC and inclusive. The latest selectable date is yesterday; Cost Explorer keeps about 13 months of history.
              {forceMonthly && " Ranges over 366 days are reported monthly."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filters</span>
          <MultiSelect label="Project" options={filterOptions.project} value={opts.project} onChange={(v) => set("project", v)} />
          <MultiSelect label="Environment" options={filterOptions.environment} value={opts.environment} onChange={(v) => set("environment", v)} />
          <MultiSelect label="Service" options={filterOptions.service} value={opts.service} onChange={(v) => set("service", v)} format={formatService} />
        </div>

        {TAG_GROUPINGS.includes(opts.groupBy) && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Grouping by {GROUP_BY_LABELS[opts.groupBy].toLowerCase()} uses resource tags that aren't all activated in AWS Billing yet, so most spend may show as “Not tagged”.
          </p>
        )}

        {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}

        <Button type="submit" disabled={mutation.isPending || Boolean(rangeError)}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart2 className="h-4 w-4" />}
          {mutation.isPending ? "Generating report…" : "Generate report"}
        </Button>
        {mutation.isPending && <span className="ml-3 text-xs text-muted-foreground">Long daily ranges take a few seconds.</span>}
      </form>

      {mutation.isError && <SectionError error={mutation.error} onRetry={() => mutation.reset()} />}

      {report && <ReportResult report={report} />}
    </div>
  );
}

function ReportResult({ report }: { report: ReportResponse }) {
  const monthly = report.granularity === "MONTHLY";
  const points = report.trend.map((t) => ({
    key: t.start,
    tick: monthly ? shortMonthLabel(t.start) : String(Number(t.start.slice(8, 10))),
    title: monthly ? `${periodLabel(t.start, t.end)}` : dateLabel(t.start),
    amount: t.amount,
  }));

  return (
    <section className="space-y-4" aria-label="Report result">
      {report.sample && <SampleBanner endpoints={["POST /cost/report"]} />}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-muted/40 p-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {periodLabel(report.period.start, report.period.end)} · {report.days} days{report.estimated ? " · estimated" : ""}
          </div>
          <div className="tabular text-3xl font-semibold tracking-tight">{money(report.total, report.currency)}</div>
          <div className="text-sm text-muted-foreground">{money(report.average_per_day, report.currency)} per day on average</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.files ? (
            <>
              <Button asChild size="sm">
                <a href={report.files.csv.url} download>
                  <Download className="h-3.5 w-3.5" /> Download CSV
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={report.files.html.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-3.5 w-3.5" /> Open report
                </a>
              </Button>
            </>
          ) : (
            <span className="max-w-xs text-xs text-muted-foreground">{report.files_note ?? "Downloads aren't available for this report."}</span>
          )}
        </div>
      </div>
      {report.files && <p className="text-xs text-muted-foreground">Download links stop working after about an hour. Generate the report again for fresh links.</p>}
      {report.note && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {report.note}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard
          title={monthly ? "Monthly spend" : "Daily spend"}
          subtitle={monthly ? "The first and last months can be partial." : undefined}
          table={<DataTable head={["Period", "Amount"]} rows={report.trend.map((t) => [periodLabel(t.start, t.end), money(t.amount, report.currency)])} />}
        >
          <SpendBars points={points} currency={report.currency} average={monthly ? null : report.average_per_day} highlightLast={false} label="Spend over the report period" />
        </ChartCard>
        <ChartCard
          title={report.group_by === "none" ? "Breakdown" : `By ${GROUP_BY_LABELS[report.group_by].toLowerCase()}`}
          subtitle={report.group_count > report.top.length ? `Top ${report.top.length} of ${report.group_count} — the CSV and HTML report contain all of them.` : undefined}
          table={
            report.top.length ? (
              <DataTable head={["Group", "Amount", "Share"]} rows={report.top.map((t) => [<span title={t.key}>{groupKeyLabel(t.key, report.group_by)}</span>, money(t.amount, report.currency), pct(t.pct)])} />
            ) : undefined
          }
        >
          <RankedList items={report.top} groupBy={report.group_by} currency={report.currency} emptyText={report.group_by === "none" ? "Not grouped." : "No spend in this period."} />
        </ChartCard>
      </div>
    </section>
  );
}
