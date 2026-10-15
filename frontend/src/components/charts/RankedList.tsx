import type { GroupBy, RankedItem } from "@/lib/api";
import { groupKeyLabel, money, pct } from "@/lib/format";

/** Largest-first list of cost groups. Long Cost Explorer names are shortened; the full
 *  name stays in a tooltip. "(untagged)" reads "Not tagged". */
export function RankedList({
  items,
  groupBy,
  currency = "USD",
  limit,
  emptyText = "No spend in this period.",
}: {
  items: RankedItem[];
  groupBy: GroupBy;
  currency?: string;
  limit?: number;
  emptyText?: string;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(...shown.map((i) => Math.abs(i.amount)), 0);
  if (!shown.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {shown.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate" title={item.key}>
              {groupKeyLabel(item.key, groupBy)}
            </span>
            <span className="tabular font-medium">{money(item.amount, currency)}</span>
            <span className="tabular w-12 text-right text-xs text-muted-foreground">{pct(item.pct)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-series-1" style={{ width: `${max ? (Math.abs(item.amount) / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
