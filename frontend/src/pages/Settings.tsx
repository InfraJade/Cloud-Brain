import { useState, type ReactNode } from "react";
import { CheckCircle2, Clock, Loader2, LogOut, Monitor, Moon, PlugZap, Sun, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useChat } from "@/contexts/ChatContext";
import { usePrefs, type Theme } from "@/contexts/PrefsContext";
import { useCloudConfig } from "@/hooks/useCloud";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { INSTANCE_TYPES, OS_OPTIONS } from "@/lib/validation";
import { cn } from "@/lib/utils";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function SettingRow({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function PrefSelect({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Check = { name: string; state: "ok" | "missing" | "error"; detail: string; ms: number };

function endpointCheck(name: string, r: { error?: Error; ms: number }, okDetail: string): Check {
  if (!r.error) return { name, state: "ok", detail: okDetail, ms: r.ms };
  if (r.error instanceof ApiError && r.error.notDeployed) return { name, state: "missing", detail: "Not deployed on AWS yet — sample data is shown instead.", ms: r.ms };
  return { name, state: "error", detail: r.error.message, ms: r.ms };
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: Error; ms: number }> {
  const start = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - start) };
  } catch (error) {
    return { error: error as Error, ms: Math.round(performance.now() - start) };
  }
}

function ConnectionTest() {
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);

  async function run() {
    setRunning(true);
    const results: Check[] = [];
    const health = await timed(api.health);
    results.push(endpointCheck("CLOUD BRAIN server", health, "Reachable"));
    const cfg = await timed(api.config);
    results.push(endpointCheck("Signed-in API access", cfg, "Authorized"));
    const list = await timed(() => api.listResources());
    results.push(
      list.value && list.value.source !== "dynamodb"
        ? { name: "Resource registry (DynamoDB)", state: "error", detail: list.value.message, ms: list.ms }
        : endpointCheck("Resource registry (DynamoDB)", list, list.value?.message ?? ""),
    );
    setChecks([...results]);
    // The spec's Lambda routes, in parallel. group_by=none keeps the Cost Explorer call cheap.
    const [inventory, cost] = await Promise.all([timed(() => api.inventory()), timed(() => api.costCurrent({ group_by: "none" }))]);
    results.push(endpointCheck("GET /inventory", inventory, "Deployed"));
    results.push(endpointCheck("GET /cost/* (Cost Explorer)", cost, "Deployed"));
    setChecks(results);
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={() => void run()} disabled={running}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Test connection
      </Button>
      {checks && (
        <ul className="divide-y rounded-lg border">
          {checks.map((c) => (
            <li key={c.name} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              {c.state === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-good" aria-label="OK" />
              ) : c.state === "missing" ? (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-label="Not deployed yet" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-critical" aria-label="Failed" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
              <span className="tabular text-xs text-muted-foreground">{c.ms} ms</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-all", mono && "font-mono text-[13px]")}>{value}</dd>
    </div>
  );
}

export default function Settings() {
  const { user, session, logout } = useAuth();
  const { prefs, setPref, resetPrefs } = usePrefs();
  const { reset: resetChat, messages } = useChat();
  const { data: config } = useCloudConfig();

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Section title="Profile" description="Accounts are managed by your CLOUD BRAIN admin in the server configuration.">
        {user && (
          <dl className="divide-y">
            <Info label="Name" value={user.full_name} />
            <Info label="Email" value={user.email} />
            <Info label="Role" value={<Badge variant="secondary" className="capitalize">{user.role}</Badge>} />
            <Info label="Session ends" value={session ? formatDateTime(session.expires_at) : "—"} />
          </dl>
        )}
      </Section>

      <Section title="Appearance">
        <SettingRow label="Theme" hint="System follows your operating system setting.">
          <div className="inline-flex rounded-lg border bg-muted p-1" role="radiogroup" aria-label="Theme">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={prefs.theme === t.value}
                onClick={() => setPref("theme", t.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  prefs.theme === t.value ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title="Assistant">
        <SettingRow id="widget" label="Floating assistant" hint="Show the chat button in the corner of every page.">
          <Switch id="widget" checked={prefs.showChatWidget} onCheckedChange={(v) => setPref("showChatWidget", v)} />
        </SettingRow>
        <SettingRow id="track" label="Track requests automatically" hint="After you confirm a change, keep checking until the pipeline finishes.">
          <Switch id="track" checked={prefs.autoTrack} onCheckedChange={(v) => setPref("autoTrack", v)} />
        </SettingRow>
        <SettingRow label="Conversation" hint="Start a fresh session with the agent.">
          <Button
            variant="outline"
            size="sm"
            disabled={messages.length === 0}
            onClick={() => {
              resetChat();
              toast.success("Conversation cleared");
            }}
          >
            Clear conversation
          </Button>
        </SettingRow>
      </Section>

      <Section title="Provisioning defaults" description="Pre-filled in the Provision form. Only dev is available as an environment for now.">
        <SettingRow label="EC2 instance type" hint="One of the 12 approved types.">
          <PrefSelect
            label="Default instance type"
            value={prefs.defaultInstanceType}
            onChange={(v) => setPref("defaultInstanceType", v)}
            options={(config?.instance_types?.length ? config.instance_types : [...INSTANCE_TYPES]).map((i) => ({ value: i, label: i }))}
          />
        </SettingRow>
        <SettingRow label="EC2 operating system">
          <PrefSelect
            label="Default operating system"
            value={prefs.defaultOs}
            onChange={(v) => setPref("defaultOs", v)}
            options={OS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </SettingRow>
      </Section>

      <Section title="Data refresh">
        <SettingRow
          id="auto-refresh"
          label="Refresh automatically"
          hint="Service counts every 2 minutes, costs every 15 minutes (AWS caches them for an hour), the resource registry every minute."
        >
          <Switch id="auto-refresh" checked={prefs.autoRefresh} onCheckedChange={(v) => setPref("autoRefresh", v)} />
        </SettingRow>
      </Section>

      <Section title="AWS connection" description="Read-only. Endpoints and credentials are configured on the server (backend/.env).">
        {config ? (
          <dl className="divide-y">
            <Info label="Cloud Brain API" value={config.endpoint} mono />
            <Info label="Agent API" value={config.agent_endpoint} mono />
            <Info label="Region" value={config.region} mono />
            <Info label="Registry table" value={config.dynamodb_table} mono />
            <Info
              label="Registry read access"
              value={
                config.direct_read_configured ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-status-good" /> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-status-critical" /> Not configured — the resource list and request tracking won't work
                  </span>
                )
              }
            />
            <Info label="API key" value={config.api_key_configured ? "Sent with every request" : "Not used"} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        <ConnectionTest />
      </Section>

      <Section title="Session">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => logout()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetPrefs();
              toast.success("Preferences reset to defaults");
            }}
          >
            Reset preferences
          </Button>
        </div>
      </Section>
    </div>
  );
}
