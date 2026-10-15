import { useState } from "react";
import { useElementWidth } from "@/hooks/useElementWidth";
import { money, moneyCompact } from "@/lib/format";

export type SpendPoint = { key: string; tick: string; title: string; amount: number };

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Single-series spend bars (daily or monthly): thin bars with rounded data ends, an
 *  average line, the latest value labelled, and a tooltip per bar on hover or focus. */
export function SpendBars({
  points,
  currency = "USD",
  average,
  highlightLast = true,
  height = 190,
  label,
}: {
  points: SpendPoint[];
  currency?: string;
  average?: number | null;
  highlightLast?: boolean;
  height?: number;
  label: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const m = { l: 46, r: 12, t: 24, b: 24 };
  const innerW = Math.max(0, width - m.l - m.r);
  const innerH = height - m.t - m.b;
  const n = points.length;
  const amounts = points.map((p) => p.amount);
  const maxVal = Math.max(0, ...amounts, average ?? 0);
  const minVal = Math.min(0, ...amounts);
  const step = niceStep((maxVal - minVal) / 4 || 1);
  const top = Math.max(step, Math.ceil(maxVal / step) * step);
  const bottom = minVal < 0 ? Math.floor(minVal / step) * step : 0;
  const y = (v: number) => m.t + innerH - ((v - bottom) / (top - bottom)) * innerH;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);

  const band = n ? innerW / n : 0;
  const barW = Math.max(2, Math.min(24, band * 0.68));
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 38))));
  // Label every `every`-th bar plus the last one; drop the regular label that would sit too close to it.
  const lastRegular = Math.floor((n - 1) / every) * every;
  const showTick = (i: number) =>
    i === n - 1 || (i % every === 0 && !(i === lastRegular && i !== n - 1 && n - 1 - i < every / 2 + 0.5));
  const y0 = y(0);

  const barPath = (i: number, v: number) => {
    const x = m.l + band * i + (band - barW) / 2;
    const yv = y(v);
    const h = Math.abs(y0 - yv);
    const r = Math.min(4, barW / 2, h);
    if (v >= 0) {
      return `M${x},${y0} V${yv + r} Q${x},${yv} ${x + r},${yv} H${x + barW - r} Q${x + barW},${yv} ${x + barW},${yv + r} V${y0} Z`;
    }
    return `M${x},${y0} V${yv - r} Q${x},${yv} ${x + r},${yv} H${x + barW - r} Q${x + barW},${yv} ${x + barW},${yv - r} V${y0} Z`;
  };

  const activePoint = active !== null ? points[active] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className="stroke-grid" strokeWidth={1} />
              <text x={m.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10px] tabular">
                {moneyCompact(t, currency)}
              </text>
            </g>
          ))}

          {points.map((p, i) => (
            <path
              key={p.key}
              d={barPath(i, p.amount)}
              className="fill-series-1 transition-opacity"
              opacity={active === i ? 1 : highlightLast && i !== n - 1 ? 0.5 : 0.9}
            />
          ))}

          {points.map((p, i) =>
            showTick(i) ? (
              <text key={`t-${p.key}`} x={m.l + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {p.tick}
              </text>
            ) : null,
          )}

          {average !== null && average !== undefined && average > 0 && (
            <g>
              <line x1={m.l} x2={width - m.r} y1={y(average)} y2={y(average)} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
              <text x={m.l + 4} y={y(average) - 5} className="fill-muted-foreground text-[10px] font-medium">
                avg {money(average, currency)}
              </text>
            </g>
          )}

          {highlightLast && n > 0 && active === null && (
            <text x={m.l + band * (n - 1) + band / 2} y={Math.min(y(points[n - 1].amount), y0) - 6} textAnchor="middle" className="fill-foreground text-[10.5px] font-semibold tabular">
              {money(points[n - 1].amount, currency)}
            </text>
          )}

          {/* Hit targets: the whole band, larger than the bar. */}
          {points.map((p, i) => (
            <rect
              key={`h-${p.key}`}
              x={m.l + band * i}
              y={m.t}
              width={band}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${p.title}: ${money(p.amount, currency)}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="cursor-default outline-none focus-visible:stroke-ring"
            />
          ))}
        </svg>
      )}

      {activePoint && active !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: m.l + band * active + band / 2, top: Math.min(y(activePoint.amount), y0) - 8 }}
        >
          <div className="tabular text-sm font-semibold text-foreground">{money(activePoint.amount, currency)}</div>
          <div className="text-muted-foreground">{activePoint.title}</div>
        </div>
      )}
    </div>
  );
}
