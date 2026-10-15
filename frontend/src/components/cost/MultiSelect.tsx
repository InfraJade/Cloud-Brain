import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResources } from "@/hooks/useCloud";
import { useKnownValues } from "@/lib/knownValues";
import { projectEnv, serviceShortName } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  format = (v) => v,
  className,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  format?: (v: string) => string;
  className?: string;
}) {
  const all = useMemo(() => [...new Set([...options, ...value])], [options, value]);
  const summary = value.length === 0 ? "Any" : value.length === 1 ? format(value[0]) : `${value.length} selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("max-w-full justify-between gap-2", value.length && "border-primary/50", className)}>
          <span className="truncate">
            <span className="text-muted-foreground">{label}:</span> {summary}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {all.length === 0 && <DropdownMenuItem disabled>No values seen yet</DropdownMenuItem>}
        {all.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt}
            checked={value.includes(opt)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => onChange(checked ? [...value, opt] : value.filter((v) => v !== opt))}
            title={opt}
          >
            <span className="truncate">{format(opt)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>
              <X className="h-3.5 w-3.5" /> Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Filter options: service names from earlier cost responses (they must match Cost Explorer
 *  exactly), projects from the registry and earlier responses, environments the platform knows. */
export function useFilterOptions() {
  const services = useKnownValues("service");
  const knownProjects = useKnownValues("project");
  const knownEnvs = useKnownValues("environment");
  const { data } = useResources();
  return useMemo(() => {
    const registryProjects = (data?.resources ?? []).map((r) => projectEnv(r).project).filter((p) => p && p !== "—");
    return {
      service: services,
      project: [...new Set([...registryProjects, ...knownProjects])].sort(),
      environment: [...new Set(["dev", "qa", "stage", ...knownEnvs])],
    };
  }, [services, knownProjects, knownEnvs, data]);
}

export const formatService = (v: string) => serviceShortName(v);
