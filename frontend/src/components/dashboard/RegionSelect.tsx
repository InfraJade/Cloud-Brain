import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGIONS } from "@/lib/format";

const DEFAULT = "__default";

/** Region selector (spec §3): Default (no parameter), a single region, or All regions (slower). */
export function RegionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || DEFAULT} onValueChange={(v) => onChange(v === DEFAULT ? "" : v)}>
      <SelectTrigger className="h-8 w-[13.5rem] text-xs" aria-label="Region for the service counts">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT}>Region: default</SelectItem>
        <SelectItem value="all">All regions (slower)</SelectItem>
        <SelectSeparator />
        {REGIONS.map((r) => (
          <SelectItem key={r.code} value={r.code}>
            {r.code} · {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
