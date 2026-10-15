import markUrl from "@/assets/brand/cloud-brain-mark.webp";
import { cn } from "@/lib/utils";

export { markUrl };

/** The Cloud Brain mark (cloud + circuit brain + orbits), transparent background. */
export function LogoMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src={markUrl}
      alt={alt}
      draggable={false}
      className={cn("h-9 w-auto shrink-0 select-none object-contain", className)}
    />
  );
}

/** Small round avatar version of the mark (chat bubbles, compact headers). */
export function LogoAvatar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-sky-500/25 dark:bg-slate-900",
        className,
      )}
      aria-hidden
    >
      <img src={markUrl} alt="" draggable={false} className="w-[86%] select-none object-contain" />
    </div>
  );
}

/** Two-tone wordmark matching the logo: "Cloud" in ink, "Brain" in the blue gradient. */
export function Wordmark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>
      <span className={onDark ? "text-white" : "text-[#043071] dark:text-white"}>Cloud</span>{" "}
      <span className="brand-text">Brain</span>
    </span>
  );
}

/** Sidebar lockup: mark + wordmark + tagline. The sidebar is always dark. */
export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-9 drop-shadow-[0_0_10px_rgba(0,159,248,0.35)]" />
      <div className="leading-tight">
        <Wordmark onDark className="text-[17px]" />
        {subtitle && <div className="text-[11px] tracking-wide text-sidebar-muted">One Brain. Every Cloud.</div>}
      </div>
    </div>
  );
}
