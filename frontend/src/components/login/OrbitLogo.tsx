import { useEffect, useId, useRef } from "react";
import { markUrl } from "@/components/brand/Logo";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

// The Cloud Brain mark inside a small 3D orbit system. Each orbit is drawn twice: its
// back half behind the mark and its front half in front, so travelling nodes pass
// behind and in front of the cloud. The whole system tilts toward the cursor.

const W = 440;
const H = 320;
const CX = W / 2;
const CY = H / 2;
const MARK_W = 288;
const MARK_H = (MARK_W * 232) / 378;

type Orbit = { rx: number; ry: number; rot: number; dur: number; reverse?: boolean; node: string; nodeR: number; stroke: string; dash?: string; opacity: number };

const ORBITS: Orbit[] = [
  { rx: 210, ry: 54, rot: -13, dur: 16, node: "#2ad3fc", nodeR: 5, stroke: "cyan", opacity: 0.55 },
  { rx: 190, ry: 70, rot: 17, dur: 23, reverse: true, node: "#fe911b", nodeR: 4.5, stroke: "warm", opacity: 0.45 },
  { rx: 168, ry: 40, rot: -2, dur: 11, node: "#009ff8", nodeR: 3.5, stroke: "faint", dash: "2 7", opacity: 0.5 },
];

const ellipsePath = (rx: number, ry: number) =>
  `M ${CX - rx},${CY} a ${rx},${ry} 0 1,0 ${rx * 2},0 a ${rx},${ry} 0 1,0 ${-rx * 2},0`;

export function OrbitLogo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = tiltRef.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const px = e.clientX / window.innerWidth - 0.5;
        const py = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 14).toFixed(2)}deg) rotateY(${(px * 18).toFixed(2)}deg)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  const layer = (half: "back" | "front") =>
    ORBITS.map((o, i) => {
      const path = ellipsePath(o.rx, o.ry);
      return (
        <g key={`${half}-${i}`} transform={`rotate(${o.rot} ${CX} ${CY})`}>
          <g clipPath={`url(#${id}-${half})`}>
            <path
              d={path}
              fill="none"
              stroke={`url(#${id}-stroke-${o.stroke})`}
              strokeWidth={half === "front" ? 1.6 : 1.2}
              strokeDasharray={o.dash}
              opacity={half === "front" ? o.opacity : o.opacity * 0.6}
            />
            <g>
              <circle r={o.nodeR * 2.6} fill={o.node} opacity={0.25} filter={`url(#${id}-blur)`} />
              <circle r={o.nodeR} fill={o.node} />
              <circle r={o.nodeR * 0.4} fill="#fff" opacity={0.85} />
              {reduced ? (
                <animateMotion dur="1s" repeatCount="1" fill="freeze" keyPoints={`${0.15 + i * 0.3};${0.15 + i * 0.3}`} keyTimes="0;1" calcMode="linear" path={path} />
              ) : (
                <animateMotion
                  dur={`${o.dur}s`}
                  repeatCount="indefinite"
                  path={path}
                  {...(o.reverse ? { keyPoints: "1;0", keyTimes: "0;1", calcMode: "linear" } : {})}
                />
              )}
            </g>
          </g>
        </g>
      );
    });

  return (
    <div className={cn("relative aspect-[440/320] w-full", className)}>
      <div ref={tiltRef} className="h-full w-full transition-transform duration-300 ease-out will-change-transform">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full overflow-visible" role="img" aria-label="Cloud Brain logo">
          <defs>
            <radialGradient id={`${id}-glow`}>
              <stop offset="0%" stopColor="#009ff8" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#0a6fd6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0a6fd6" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-stroke-cyan`} x1="0" x2="1">
              <stop offset="0%" stopColor="#2ad3fc" stopOpacity="0" />
              <stop offset="35%" stopColor="#2ad3fc" />
              <stop offset="100%" stopColor="#009ff8" />
            </linearGradient>
            <linearGradient id={`${id}-stroke-warm`} x1="0" x2="1">
              <stop offset="0%" stopColor="#009ff8" />
              <stop offset="70%" stopColor="#38b2f8" />
              <stop offset="100%" stopColor="#fe911b" />
            </linearGradient>
            <linearGradient id={`${id}-stroke-faint`} x1="0" x2="1">
              <stop offset="0%" stopColor="#38b2f8" />
              <stop offset="100%" stopColor="#2ad3fc" />
            </linearGradient>
            <clipPath id={`${id}-back`} clipPathUnits="userSpaceOnUse">
              <rect x={-W} y={-H} width={W * 3} height={CY + H} />
            </clipPath>
            <clipPath id={`${id}-front`} clipPathUnits="userSpaceOnUse">
              <rect x={-W} y={CY} width={W * 3} height={H * 2} />
            </clipPath>
            <filter id={`${id}-blur`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          <circle cx={CX} cy={CY} r={175} fill={`url(#${id}-glow)`}>
            {!reduced && <animate attributeName="opacity" values="0.6;1;0.6" dur="5s" repeatCount="indefinite" />}
          </circle>

          {layer("back")}

          <g>
            <image href={markUrl} x={CX - MARK_W / 2} y={CY - MARK_H / 2} width={MARK_W} height={MARK_H} />
            {!reduced && (
              <animateTransform attributeName="transform" type="translate" values="0 0; 0 -7; 0 0" dur="6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1; 0.45 0 0.55 1" />
            )}
          </g>

          {layer("front")}
        </svg>
      </div>
    </div>
  );
}
