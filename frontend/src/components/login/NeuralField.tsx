import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

// A living "neural constellation": drifting nodes that link up when close, signals that
// fire node-to-node along those links, a cursor that pulls the network toward it, and a
// click shockwave. Pure canvas 2D — no dependencies.

type Theme = "light" | "dark";

type Node = { x: number; y: number; vx: number; vy: number; r: number; kind: 0 | 1 | 2; flash: number };
type Signal = { from: number; to: number; prev: number; t: number; speed: number; hops: number };
type Ripple = { x: number; y: number; age: number };

const PALETTES: Record<Theme, { nodes: string[]; link: string; linkMax: number; pointerLink: string; pointerGlow: string; signal: string }> = {
  dark: {
    nodes: ["#2ad3fc", "#38b2f8", "#fe911b"],
    link: "56,189,248",
    linkMax: 0.22,
    pointerLink: "42,211,252",
    pointerGlow: "rgba(42,211,252,0.09)",
    signal: "#7fe8ff",
  },
  light: {
    nodes: ["#0a6fd6", "#009ff8", "#fe911b"],
    link: "10,111,214",
    linkMax: 0.17,
    pointerLink: "0,159,248",
    pointerGlow: "rgba(0,159,248,0.08)",
    signal: "#009ff8",
  },
};

const LINK_DIST = 140;
const POINTER_DIST = 190;
const MAX_SIGNALS = 16;

function makeSprite(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color + "aa");
  grad.addColorStop(1, color + "00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function NeuralField({ theme, className }: { theme: Theme; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const themeRef = useRef(theme);
  const reducedMotion = usePrefersReducedMotion();
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    themeRef.current = theme;
    redrawRef.current();
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    let signals: Signal[] = [];
    let ripples: Ripple[] = [];
    let raf = 0;
    let last = performance.now();
    let lastSpawn = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const sprites = new Map<string, HTMLCanvasElement>();
    const sprite = (color: string) => {
      let s = sprites.get(color);
      if (!s) {
        s = makeSprite(color);
        sprites.set(color, s);
      }
      return s;
    };

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const newNode = (): Node => {
      const roll = Math.random();
      return {
        x: rand(0, width),
        y: rand(0, height),
        vx: rand(-0.25, 0.25),
        vy: rand(-0.25, 0.25),
        r: rand(1, 2.3),
        kind: roll < 0.06 ? 2 : roll < 0.4 ? 1 : 0,
        flash: 0,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.max(36, Math.min(150, Math.round((width * height) / 13000)));
      while (nodes.length < target) nodes.push(newNode());
      if (nodes.length > target) nodes = nodes.slice(0, target);
      signals = signals.filter((s) => s.from < nodes.length && s.to < nodes.length);
      for (const n of nodes) {
        n.x = Math.min(n.x, width);
        n.y = Math.min(n.y, height);
      }
    };

    const neighbours = (i: number, exclude = -1) => {
      const a = nodes[i];
      const out: number[] = [];
      for (let j = 0; j < nodes.length; j++) {
        if (j === i || j === exclude) continue;
        const dx = nodes[j].x - a.x;
        const dy = nodes[j].y - a.y;
        if (dx * dx + dy * dy < LINK_DIST * LINK_DIST) out.push(j);
      }
      return out;
    };

    const spawnSignal = (from: number, hops: number) => {
      if (signals.length >= MAX_SIGNALS) return;
      const options = neighbours(from);
      if (!options.length) return;
      const to = options[Math.floor(Math.random() * options.length)];
      signals.push({ from, to, prev: -1, t: 0, speed: rand(0.022, 0.04), hops });
    };

    const nearestNode = (x: number, y: number) => {
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((n, i) => {
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };

    const draw = (dt: number, animate: boolean) => {
      const pal = PALETTES[themeRef.current];
      ctx.clearRect(0, 0, width, height);

      // Pointer "flashlight".
      if (pointer.active) {
        const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 260);
        g.addColorStop(0, pal.pointerGlow);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(pointer.x - 260, pointer.y - 260, 520, 520);
      }

      if (animate) {
        for (const r of ripples) {
          r.age += dt;
          const radius = r.age * 7;
          for (const n of nodes) {
            const dx = n.x - r.x;
            const dy = n.y - r.y;
            const d = Math.hypot(dx, dy) || 1;
            if (Math.abs(d - radius) < 24) {
              n.vx += (dx / d) * 0.5;
              n.vy += (dy / d) * 0.5;
            }
          }
        }
        ripples = ripples.filter((r) => r.age < 55);

        for (const n of nodes) {
          if (pointer.active) {
            const dx = pointer.x - n.x;
            const dy = pointer.y - n.y;
            const d = Math.hypot(dx, dy);
            if (d < POINTER_DIST && d > 1) {
              const f = (1 - d / POINTER_DIST) * 0.035;
              n.vx += (dx / d) * f;
              n.vy += (dy / d) * f;
            }
          }
          n.vx += rand(-0.012, 0.012);
          n.vy += rand(-0.012, 0.012);
          n.vx *= 0.985;
          n.vy *= 0.985;
          const speed = Math.hypot(n.vx, n.vy);
          if (speed > 1.6) {
            n.vx = (n.vx / speed) * 1.6;
            n.vy = (n.vy / speed) * 1.6;
          }
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          if (n.x < -20) n.x = width + 20;
          if (n.x > width + 20) n.x = -20;
          if (n.y < -20) n.y = height + 20;
          if (n.y > height + 20) n.y = -20;
          n.flash = Math.max(0, n.flash - 0.03 * dt);
        }
      }

      // Links, batched into alpha buckets (one stroke per bucket).
      const BUCKETS = 6;
      const paths = Array.from({ length: BUCKETS }, () => new Path2D());
      const used = new Array(BUCKETS).fill(false);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          const strength = 1 - Math.sqrt(d2) / LINK_DIST;
          const k = Math.min(BUCKETS - 1, Math.floor(strength * BUCKETS));
          paths[k].moveTo(a.x, a.y);
          paths[k].lineTo(b.x, b.y);
          used[k] = true;
        }
      }
      ctx.lineWidth = 1;
      for (let k = 0; k < BUCKETS; k++) {
        if (!used[k]) continue;
        ctx.strokeStyle = `rgba(${pal.link},${(((k + 1) / BUCKETS) * pal.linkMax).toFixed(3)})`;
        ctx.stroke(paths[k]);
      }

      // Cursor links.
      if (pointer.active) {
        for (const n of nodes) {
          const d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
          if (d < POINTER_DIST) {
            ctx.strokeStyle = `rgba(${pal.pointerLink},${((1 - d / POINTER_DIST) * 0.5).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(pointer.x, pointer.y);
            ctx.lineTo(n.x, n.y);
            ctx.stroke();
          }
        }
      }

      // Click ripples.
      for (const r of ripples) {
        ctx.strokeStyle = `rgba(${pal.pointerLink},${(0.35 * (1 - r.age / 55)).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.age * 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Nodes: soft glow sprite + crisp core.
      for (const n of nodes) {
        const color = pal.nodes[n.kind];
        const near = pointer.active ? Math.max(0, 1 - Math.hypot(n.x - pointer.x, n.y - pointer.y) / POINTER_DIST) : 0;
        const glow = n.r * (5 + near * 4 + n.flash * 6);
        ctx.globalAlpha = 0.35 + near * 0.4 + n.flash * 0.5;
        ctx.drawImage(sprite(color), n.x - glow, n.y - glow, glow * 2, glow * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + n.flash * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Signals travelling along links.
      if (animate) {
        const next: Signal[] = [];
        for (const s of signals) {
          s.t += s.speed * dt;
          if (s.t >= 1) {
            nodes[s.to].flash = 1;
            if (s.hops > 1) {
              const options = neighbours(s.to, s.from);
              if (options.length) {
                const to = options[Math.floor(Math.random() * options.length)];
                next.push({ from: s.to, to, prev: s.from, t: 0, speed: s.speed, hops: s.hops - 1 });
              }
            }
            continue;
          }
          next.push(s);
        }
        signals = next;
      }
      for (const s of signals) {
        const a = nodes[s.from];
        const b = nodes[s.to];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * s.t;
        const y = a.y + (b.y - a.y) * s.t;
        const tail = Math.max(0, s.t - 0.35);
        const tx = a.x + (b.x - a.x) * tail;
        const ty = a.y + (b.y - a.y) * tail;
        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, pal.signal + "00");
        grad.addColorStop(1, pal.signal);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sprite(pal.signal), x - 9, y - 9, 18, 18);
        ctx.globalAlpha = 1;
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 50) / 16.67;
      last = now;
      if (now - lastSpawn > 320 && nodes.length) {
        lastSpawn = now;
        spawnSignal(Math.floor(Math.random() * nodes.length), 3 + Math.floor(Math.random() * 4));
      }
      draw(dt, true);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (reducedMotion) draw(0, false);
      else raf = requestAnimationFrame(frame);
    };

    redrawRef.current = () => {
      if (reducedMotion) draw(0, false);
    };

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = e.pointerType === "mouse" || e.pointerType === "pen";
      if (reducedMotion) draw(0, false);
    };
    const onLeave = () => {
      pointer.active = false;
      if (reducedMotion) draw(0, false);
    };
    const onDown = (e: PointerEvent) => {
      if (reducedMotion) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-no-ripple]")) return;
      ripples.push({ x: e.clientX, y: e.clientY, age: 0 });
      const origin = nearestNode(e.clientX, e.clientY);
      if (origin >= 0) for (let i = 0; i < 4; i++) spawnSignal(origin, 5);
    };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else start();
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion) draw(0, false);
    });
    ro.observe(canvas);
    resize();
    start();

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
