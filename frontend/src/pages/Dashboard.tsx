import { Link } from "react-router-dom";
import { ArrowRight, FileBarChart2, RefreshCw } from "lucide-react";
import { ChartCard, DataTable } from "@/components/charts/ChartCard";
import { RankedList } from "@/components/charts/RankedList";
import { SpendBars } from "@/components/charts/SpendBars";
import { SampleBadge, SampleBanner, SectionError } from "@/components/common/Notices";
import { ReportDialog } from "@/components/cost/ReportDialog";
import { CostCards } from "@/components/dashboard/CostCards";
import { RegionSelect } from "@/components/dashboard/RegionSelect";
import { ServiceTiles } from "@/components/dashboard/ServiceTiles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePrefs } from "@/contexts/PrefsContext";
import { useCostCurrent, useCostForecast, useInventory } from "@/hooks/useCloud";
import { useNow } from "@/hooks/useNow";
import { dateLabel, groupKeyLabel, money, pct, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** The landing page (spec §3). Three requests fire in parallel — A: GET /cost/current,
 *  B: GET /cost/forecast, C: GET /inventory — and each section has its own loading and
 *  error state, so one slow or failed call never blanks the page. */
export default function Dashboard() {
  const { user } = useAuth();
  const { prefs, setPref } = usePrefs();
  const region = prefs.dashboardRegion || undefined;

  const current = useCostCurrent({ group_by: "service" }); // A
  const forecast = useCostForecast(); // B
  const inventory = useInventory(region); // C
  useNow(30_000);

  const a = current.data;
  const stamps = [a?.as_of, forecast.data?.as_of, inventory.data?.generated_at]
    .filter((s): s is string => Boolean(s))
    .map((s) => Date.parse(s));
  const oldest = stamps.length ? Math.min(...stamps) : null;
  const fetching = current.isFetching || forecast.isFetching || inventory.isFetching;
  const refresh = () => {
    void current.refetch();
    void forecast.refetch();
    void inventory.refetch();
  };
  const samples = [a?.sample && "GET /cost/current", forecast.data?.sample && "GET /cost/forecast", inventory.data?.sample && "GET /inventory"].filter(
    (s): s is string => Boolean(s),
  );
  const firstName = user?.full_name.split(" ")[0] ?? "";
  const scope = inventory.data?.regions?.length ? inventory.data.regions.join(", ") : region === "all" ? "all regions" : region ?? "default region";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            {greeting()}, <span className="text-gradient">{firstName}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Spend and running services across your AWS account.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelect value={prefs.dashboardRegion} onChange={(v) => setPref("dashboardRegion", v)} />
          <span className="text-xs text-muted-foreground" title="The oldest of the three data sources">
            {oldest ? `Updated ${timeAgo(oldest)}` : ""}
          </span>
          <Button variant="outline" size="sm" onClick={refresh} disabled={fetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", fetching && "animate-spin")} /> Refresh
          </Button>
          <ReportDialog
            trigger={
              <Button size="sm">
                <FileBarChart2 className="h-3.5 w-3.5" /> Generate cost report
              </Button>
            }
          />
        </div>
      </div>

      {samples.length > 0 && <SampleBanner endpoints={samples} />}

      <section aria-label="Costs" className={cn("transition-opacity", fetching && !current.isLoading && "opacity-80")}>
        <CostCards current={current} forecast={forecast} />
      </section>

      <section aria-labelledby="services-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="services-heading" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            Services {inventory.data?.sample && <SampleBadge />}
          </h3>
          <span className="text-xs text-muted-foreground">
            Counts for {scope} · S3 is account-wide · cost figures above cover the whole account
          </span>
        </div>
        <ServiceTiles query={inventory} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [&>*]:animate-rise [&>*:nth-child(2)]:[animation-delay:120ms]">
        <ChartCard
          title="Daily spend this month"
          badge={a?.sample && <SampleBadge />}
          subtitle={a?.period ? "Complete UTC days — today isn't included until AWS finishes adding it up." : undefined}
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
              label={`Daily spend this month, average ${money(a.average_per_day, a.currency)}`}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{a?.note ?? "No complete day yet this month."}</p>
          )}
        </ChartCard>

        <ChartCard
          title="Top services this month"
          badge={a?.sample && <SampleBadge />}
          table={a?.top.length ? <DataTable head={["Service", "Amount", "Share"]} rows={a.top.map((t) => [<span title={t.key}>{groupKeyLabel(t.key, "service")}</span>, money(t.amount, a.currency), pct(t.pct)])} /> : undefined}
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
              <RankedList items={a.top} groupBy="service" currency={a.currency} limit={6} />
              <Button variant="ghost" size="sm" asChild className="mt-3 -ml-2">
                <Link to="/costs">
                  Explore costs <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </>
          ) : null}
        </ChartCard>
      </div>
    </div>
  );
}
