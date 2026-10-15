import { useId } from "react";
import { cn } from "@/lib/utils";

/** Decorative trend line (the full chart with values sits further down the page). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const w = 200;
  const h = 64;
  const pad = 6;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const lx = x(values.length - 1);
  const ly = y(values[values.length - 1]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--series-1)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--series-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={4} fill="var(--series-1)" stroke="hsl(var(--card))" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
