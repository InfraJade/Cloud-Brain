import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, GitBranch, Loader2, Lock, Mail, Moon, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { NeuralField } from "@/components/login/NeuralField";
import { OrbitLogo } from "@/components/login/OrbitLogo";
import { ServiceStatus } from "@/components/login/ServiceStatus";
import { useAuth } from "@/contexts/AuthContext";
import { usePrefs } from "@/contexts/PrefsContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  "Provision EC2 and S3 in plain English",
  "Spot idle resources before they cost you",
  "See your AWS spend at a glance",
  "Every change shipped through Terraform GitOps",
];

const CHIPS = [
  { icon: Sparkles, label: "AI assistant" },
  { icon: GitBranch, label: "Terraform GitOps" },
  { icon: ShieldCheck, label: "Confirm before change" },
];

/** Cycles through the capability lines with a slide/fade. */
function RotatingLine() {
  const [i, setI] = useState(0);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % CAPABILITIES.length), 3200);
    return () => window.clearInterval(t);
  }, [reduced]);
  return (
    <div className="relative h-7 overflow-hidden" aria-hidden>
      {CAPABILITIES.map((c, n) => (
        <div
          key={c}
          className={cn(
            "absolute inset-0 flex items-center gap-2 text-base text-muted-foreground transition-all duration-500",
            n === i ? "translate-y-0 opacity-100" : n === (i - 1 + CAPABILITIES.length) % CAPABILITIES.length ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#2ad3fc] shadow-[0_0_10px_#2ad3fc]" />
          {c}
        </div>
      ))}
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const { resolvedTheme, setPref } = usePrefs();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "success">("idle");
  const [shake, setShake] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const from = (location.state as { from?: string } | null)?.from || "/";
  if (user && phase !== "success") return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (phase !== "idle") return;
    setError(null);
    setPhase("loading");
    try {
      await login(email, password);
      setPhase("success");
      window.setTimeout(() => navigate(from, { replace: true }), reduced ? 0 : 650);
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
      setShake(true);
    }
  }

  function onCaps(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }

  // Card tilts toward the pointer, with a glare spot that follows it.
  function onCardMove(e: PointerEvent<HTMLDivElement>) {
    if (reduced || e.pointerType !== "mouse") return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${((px - 0.5) * 7).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${((0.5 - py) * 7).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
    el.style.setProperty("--glare", "1");
  }
  function onCardLeave() {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--glare", "0");
  }

  const firstName = user?.full_name.split(" ")[0];

  return (
    <div className="login-bg relative min-h-full overflow-hidden">
      <NeuralField theme={resolvedTheme} className="pointer-events-none fixed inset-0 h-full w-full" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-end gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center gap-2" data-no-ripple>
          <ServiceStatus className="hidden sm:inline-flex" />
          <button
            type="button"
            onClick={() => setPref("theme", resolvedTheme === "dark" ? "light" : "dark")}
            className="glass-pill flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-8 px-4 pb-16 sm:px-8 lg:min-h-[calc(100dvh-8.5rem)] lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        {/* Hero */}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <OrbitLogo className="-my-6 max-w-[320px] sm:max-w-[440px] lg:-my-8 lg:-ml-10 lg:max-w-[600px]" />
          <h2 className="animate-rise mt-2 text-4xl sm:text-5xl lg:text-6xl">
            <Wordmark />
          </h2>
          <p className="animate-rise mt-3 text-sm font-medium uppercase tracking-[0.32em] text-[#0a6fd6] [animation-delay:80ms] dark:text-[#2ad3fc]">
            One Brain. Every Cloud.
          </p>
          <div className="animate-rise mt-6 hidden w-full max-w-md [animation-delay:160ms] lg:block">
            <RotatingLine />
          </div>
          <ul className="animate-rise mt-6 hidden flex-wrap gap-2 [animation-delay:240ms] sm:flex">
            {CHIPS.map(({ icon: Icon, label }) => (
              <li key={label} className="glass-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground">
                <Icon className="h-3.5 w-3.5 text-[#009ff8]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </section>

        {/* Sign-in card */}
        <section className="flex justify-center lg:justify-end" data-no-ripple>
          <div
            ref={cardRef}
            onPointerMove={onCardMove}
            onPointerLeave={onCardLeave}
            onAnimationEnd={() => setShake(false)}
            className={cn("tilt-card glass relative w-full max-w-[420px] rounded-3xl p-7 sm:p-9", shake && "animate-shake")}
          >
            {phase === "success" ? (
              <div className="flex min-h-[380px] flex-col items-center justify-center text-center" role="status">
                <div className="brand-gradient flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_0_40px_-4px_#009ff8]">
                  <Check className="h-8 w-8" />
                </div>
                <h1 className="mt-5 text-2xl font-semibold tracking-tight">Welcome, {firstName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">Connecting to your clouds…</p>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Sign in with the account your Cloud Brain admin set up for you.</p>

                <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                      Email
                    </label>
                    <div className="glass-input flex items-center gap-2.5 rounded-xl px-3.5">
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        id="email"
                        type="email"
                        autoComplete="username"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@jadeglobal.com"
                        required
                        autoFocus
                        className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                      Password
                    </label>
                    <div className="glass-input flex items-center gap-2.5 rounded-xl pl-3.5 pr-1.5">
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={onCaps}
                        onKeyUp={onCaps}
                        required
                        aria-describedby={capsLock ? "caps-hint" : undefined}
                        className="h-11 w-full bg-transparent text-sm outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {capsLock && (
                      <p id="caps-hint" className="mt-1.5 text-xs font-medium text-[#c27400] dark:text-status-warning">
                        Caps Lock is on
                      </p>
                    )}
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={phase === "loading" || !email || !password}
                    className="btn-shimmer brand-gradient group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-[0_10px_30px_-10px_#009ff8] transition-[transform,box-shadow,opacity] hover:shadow-[0_14px_40px_-10px_#009ff8] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {phase === "loading" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Authenticating…
                      </>
                    ) : (
                      <>
                        Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-7 flex items-center justify-between gap-3 border-t border-foreground/10 pt-5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-status-good" /> Secure session
                  </span>
                  <ServiceStatus className="sm:hidden" />
                  <span className="hidden sm:inline">Sessions end automatically</span>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="relative z-10 pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Jade Global · Cloud Brain
        {!reduced && <span className="hidden sm:inline"> · Click anywhere in the background to send a pulse</span>}
      </footer>
    </div>
  );
}
