import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { CircleDollarSign, LayoutDashboard, ListChecks, LogOut, Menu, Moon, Rocket, Server, Settings, Sparkles, Sun } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { useRequests } from "@/contexts/RequestsContext";
import { usePrefs } from "@/contexts/PrefsContext";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Routes follow the spec's suggested UI structure (BACKEND-API.md §10). */
export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/provision", label: "Provision", icon: Rocket },
  { to: "/requests", label: "Requests", icon: ListChecks },
  { to: "/resources", label: "Resources", icon: Server },
  { to: "/costs", label: "Costs", icon: CircleDollarSign },
  { to: "/assistant", label: "Assistant", icon: Sparkles },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function titleFor(pathname: string) {
  if (pathname.startsWith("/requests/")) return "Request tracker";
  return NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ?? "Cloud Brain";
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pendingCount } = useRequests();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "nav-active text-white"
                : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn("h-4 w-4 transition-colors", isActive ? "text-[#22d3ee] drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]" : "group-hover:text-sidebar-foreground")}
                aria-hidden
              />
              <span className="flex-1">{label}</span>
              {to === "/requests" && pendingCount > 0 && (
                <span className="rounded-full bg-gradient-to-r from-sky-500/30 to-indigo-500/30 px-1.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-400/30" title={`${pendingCount} request(s) in progress`}>
                  {pendingCount}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="sidebar-surface flex h-full flex-col text-sidebar-foreground">
      <div className="px-5 py-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="m-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-sidebar-muted backdrop-blur">
        <div className="mb-1 font-display font-semibold text-sidebar-foreground">How it works</div>
        Requests run through AWS Step Functions → Terraform (GitOps). New resources appear once the pipeline completes.
      </div>
    </div>
  );
}

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { prefs, setPref, resolvedTheme } = usePrefs();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const showWidget = prefs.showChatWidget && location.pathname !== "/assistant";

  // Cursor spotlight on glass cards: one delegated listener sets the glow position.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      const card = (e.target as HTMLElement | null)?.closest?.(".glass-card") as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
      last = card;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      last?.style.removeProperty("--mx");
    };
  }, []);

  return (
    <div className="relative isolate flex min-h-full">
      <div className="app-aurora" aria-hidden />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <SidebarBody />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[color:var(--glass-border)] bg-background/55 px-4 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">{title}</h1>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
            onClick={() => setPref("theme", resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
                    <AvatarFallback className="btn-primary-grad text-xs font-semibold text-white">{initials(user.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">{user.full_name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user.full_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                  <Badge variant="secondary" className="mt-2 capitalize">{user.role}</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => logout()} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>

      {showWidget && <ChatWidget />}
    </div>
  );
}
