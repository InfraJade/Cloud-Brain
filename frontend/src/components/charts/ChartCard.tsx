import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Card with a chart/table toggle, so every value is reachable without hovering. */
export function ChartCard({
  title,
  subtitle,
  badge,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            {title} {badge}
          </CardTitle>
          {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {table && (
          <button
            type="button"
            onClick={() => setAsTable((t) => !t)}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-pressed={asTable}
          >
            {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </CardHeader>
      <CardContent className="min-w-0 flex-1">{asTable && table ? table : children}</CardContent>
    </Card>
  );
}

export function DataTable({ head, rows, alignRight = [] }: { head: string[]; rows: ReactNode[][]; alignRight?: number[] }) {
  return (
    <div className="max-h-80 overflow-auto">
      <table className="tabular w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={cn("py-1.5 pr-2 font-medium", (i > 0 || alignRight.includes(i)) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b last:border-0">
              {r.map((c, i) => (
                <td key={i} className={cn("py-1.5 pr-2", i > 0 && "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
