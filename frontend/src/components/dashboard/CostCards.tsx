import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarDays, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { SampleBadge, SectionError } from "@/components/common/Notices";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CurrentMonthResponse, ForecastResponse } from "@/lib/api";
import { money, monthLabel, pct, periodLabel, previousMonth, shortMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { Sparkline } from "./Sparkline";

/** Spend change: up (spend rose) in red, down in green, with an arrow — hidden when null. */
export function Delta({ value, suffix }: { value: number | null | undefined; suffix: string }) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const flat = value === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
        flat ? "bg-muted text-muted-foreground" : up ? "bg-delta-up/10 text-delta-up" : "bg-delta-down/10 text-delta-down",
      )}
    >
      {!flat && <Icon className="h-4 w-4" aria-hidden />}
      <span>
        <span className="sr-only">{up ? "Up " : flat ? "" : "Down "}</span>
        {pct(Math.abs(value))} {suffix}
      </span>
    </span>
  );
}

function TileHeader({ icon: Icon, label, badge }: { icon: LucideIcon; label: string; badge?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <span className="icon-chip flex h-8 w-8 items-center justify-center rounded-lg text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      {badge}
    </div>
  );
}

const moneyFmt = (currency: string) => (n: number) => money(n, currency);

function Loading({ big = false }: { big?: boolean }) {
  return (
    <div className="space-y-3 pt-4">
      <Skeleton className={big ? "h-12 w-52" : "h-9 w-36"} />
      <Skeleton className="h-5 w-56" />
    </div>
  );
}

function Shell({ className, delay, children }: { className?: string; delay: number; children: ReactNode }) {
  return (
    <Card className={cn("lift animate-rise overflow-hidden", className)} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="relative flex h-full flex-col p-6">{children}</CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[color:var(--glass-border)] bg-background/40 px-3 py-2">
      <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

/** Hero tile: month-to-date spend with its daily trend. */
export function MonthToDateTile({ query, className, delay = 0 }: { query: UseQueryResult<CurrentMonthResponse>; className?: string; delay?: number }) {
  const a = query.data;
  return (
    <Shell className={className} delay={delay}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.22),transparent_65%)]" aria-hidden />
      <TileHeader icon={Wallet} label="Month to date" badge={a?.sample ? <SampleBadge /> : a?.period ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{periodLabel(a.period.start, a.period.end)}{a.estimated ? " · estimated" : ""}</span> : null} />
      {query.isLoading ? (
        <Loading big />
      ) : query.isError && !a ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} className="mt-4" />
      ) : a ? (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="space-y-2">
              <CountUp value={a.total} format={moneyFmt(a.currency)} className="tabular block font-display text-5xl font-semibold tracking-tight" />
              <Delta value={a.change_pct} suffix="vs same days last month" />
              {!a.period && <p className="text-xs text-muted-foreground">{a.note}</p>}
            </div>
            <Sparkline values={a.daily.map((d) => d.amount)} className="h-16 w-full max-w-[240px]" />
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
            <MiniStat label="Avg / day" value={money(a.average_per_day, a.currency)} />
            <MiniStat label={`${shortMonth(previousMonth(a.month))} 1–${a.days_elapsed}`} value={money(a.same_days_last_month, a.currency)} />
            <MiniStat label="Days" value={`${a.days_elapsed} / ${a.days_in_month}`} />
          </div>
        </>
      ) : null}
    </Shell>
  );
}

/** Forecast tile, with how much of the forecast has been spent so far. */
export function ForecastTile({ query, className, delay = 0 }: { query: UseQueryResult<ForecastResponse>; className?: string; delay?: number }) {
  const b = query.data;
  const projected = b?.projected_month_end;
  const spentShare = b && projected ? Math.min(100, Math.max(0, (b.month_to_date / projected) * 100)) : 0;
  return (
    <Shell className={className} delay={delay}>
      <TileHeader icon={TrendingUp} label="Forecast, month end" badge={b?.sample && <SampleBadge />} />
      {query.isLoading ? (
        <Loading />
      ) : query.isError && !b ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} className="mt-4" />
      ) : b && b.forecast_available && projected !== undefined ? (
        <>
          <CountUp value={projected} format={moneyFmt(b.currency)} className="tabular mt-4 block font-display text-4xl font-semibold tracking-tight" />
          <div className="mt-2">
            <Delta value={b.change_vs_last_month_pct} suffix="vs last month" />
          </div>
          {b.prediction_interval && (
            <p className="mt-2 text-xs text-muted-foreground">
              Likely {money(b.prediction_interval.low, b.currency)} – {money(b.prediction_interval.high, b.currency)}
              <span className="sr-only"> ({b.prediction_interval.level}% range)</span>
            </p>
          )}
          <div className="mt-auto pt-5">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Spent so far</span>
              <span className="tabular font-medium text-foreground">{Math.round(spentShare)}% of forecast</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-series-1/15" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(spentShare)} aria-label="Share of the forecast spent so far">
              <div className="h-full rounded-full bg-series-1 transition-[width] duration-700" style={{ width: `${spentShare}%` }} />
            </div>
          </div>
        </>
      ) : b ? (
        <>
          <CountUp value={b.month_to_date} format={moneyFmt(b.currency)} className="tabular mt-4 block font-display text-4xl font-semibold tracking-tight" />
          <p className="mt-2 text-xs text-muted-foreground">Month to date. {b.note ?? "A forecast isn't available yet."}</p>
        </>
      ) : null}
    </Shell>
  );
}

/** Last month's total, next to this month's forecast. */
export function LastMonthTile({
  current,
  forecast,
  className,
  delay = 0,
}: {
  current: UseQueryResult<CurrentMonthResponse>;
  forecast: UseQueryResult<ForecastResponse>;
  className?: string;
  delay?: number;
}) {
  const a = current.data;
  const projected = forecast.data?.forecast_available ? forecast.data.projected_month_end : undefined;
  const max = Math.max(a?.last_month_total ?? 0, projected ?? 0, 1);
  return (
    <Shell className={className} delay={delay}>
      <TileHeader icon={CalendarDays} label="Last month" badge={a?.sample && <SampleBadge />} />
      {current.isLoading ? (
        <Loading />
      ) : current.isError && !a ? (
        <SectionError error={current.error} onRetry={() => void current.refetch()} className="mt-4" />
      ) : a ? (
        <>
          <CountUp value={a.last_month_total} format={moneyFmt(a.currency)} className="tabular mt-4 block font-display text-4xl font-semibold tracking-tight" />
          <p className="mt-2 text-sm text-muted-foreground">{monthLabel(previousMonth(a.month))} · full month</p>
          {projected !== undefined && (
            <div className="mt-auto space-y-2 pt-5 text-xs">
              {[
                { label: monthLabel(previousMonth(a.month)).split(" ")[0], value: a.last_month_total, cls: "bg-muted-foreground/35" },
                { label: `${monthLabel(a.month).split(" ")[0]} (forecast)`, value: projected, cls: "bg-series-1" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-muted-foreground">
                    <span>{row.label}</span>
                    <span className="tabular font-medium text-foreground">{money(row.value, a.currency)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", row.cls)} style={{ width: `${(row.value / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </Shell>
  );
}

/** The three cost tiles as a bento row: the month-to-date hero spans two columns. */
export function CostCards({ current, forecast }: { current: UseQueryResult<CurrentMonthResponse>; forecast: UseQueryResult<ForecastResponse> }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MonthToDateTile query={current} className="md:col-span-2" delay={0} />
      <ForecastTile query={forecast} delay={80} />
      <LastMonthTile current={current} forecast={forecast} delay={160} />
    </div>
  );
}
