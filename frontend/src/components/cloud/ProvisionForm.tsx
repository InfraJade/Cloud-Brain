import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Database, Loader2, RefreshCw, Rocket, Server, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { usePrefs } from "@/contexts/PrefsContext";
import { useRequests } from "@/contexts/RequestsContext";
import { useCloudConfig } from "@/hooks/useCloud";
import { ApiError, api, type ResourceType } from "@/lib/api";
import {
  DEFAULT_ENVIRONMENTS,
  INSTANCE_TYPES,
  OS_OPTIONS,
  PROJECT_RE,
  PROJECT_RULE,
  REQUEST_ID_RE,
  REQUEST_ID_RULE,
  newRequestId,
  osLabel,
  sanitizePerson,
  toProjectName,
} from "@/lib/validation";
import { cn } from "@/lib/utils";

const APPROVER = "Authorized Platform Admin";

/** EC2 / S3 request form (spec §4.5, validated against §7 before anything is sent). */
export function ProvisionForm({ type, onTypeChange }: { type: ResourceType; onTypeChange: (t: ResourceType) => void }) {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const requests = useRequests();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: config } = useCloudConfig();

  const environments = config?.environments?.length ? config.environments : DEFAULT_ENVIRONMENTS;
  const instanceTypes: readonly string[] = config?.instance_types?.length ? config.instance_types : INSTANCE_TYPES;

  // Prefill from an assistant proposal ("Use the form instead"), if present.
  const [project, setProject] = useState(() => toProjectName(params.get("project") ?? ""));
  const [env, setEnv] = useState(() => params.get("env") ?? "dev");
  const [instanceType, setInstanceType] = useState(() => {
    const p = params.get("instance_type");
    return p && (INSTANCE_TYPES as readonly string[]).includes(p) ? p : prefs.defaultInstanceType;
  });
  const [osName, setOsName] = useState(() => {
    const p = params.get("os_name");
    return p && OS_OPTIONS.some((o) => o.value === p) ? p : prefs.defaultOs;
  });
  const [requestId, setRequestId] = useState(() => newRequestId());
  const [touched, setTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fromAssistant = params.has("from") && params.get("from") === "assistant";

  useEffect(() => {
    if (!environments.includes(env)) setEnv(environments[0]);
  }, [environments, env]);
  useEffect(() => {
    if (!instanceTypes.includes(instanceType)) setInstanceType("t3.micro");
  }, [instanceTypes, instanceType]);

  const requester = sanitizePerson(user?.full_name ?? "");
  const projectValid = PROJECT_RE.test(project);
  const requestIdValid = REQUEST_ID_RE.test(requestId);
  const requestIdUsed = Boolean(requests.get(requestId));
  const valid = projectValid && requestIdValid && !requestIdUsed && environments.includes(env);

  const summary = useMemo(
    () =>
      type === "ec2"
        ? `EC2 ${instanceType} (${osLabel(osName)}) for project ${project} in ${env}`
        : `S3 bucket for project ${project} in ${env}`,
    [type, instanceType, osName, project, env],
  );

  async function submit() {
    setSubmitting(true);
    try {
      const res = await api.provision({
        project,
        env,
        resource_type: type,
        request_id: requestId,
        ...(type === "ec2" ? { instance_type: instanceType, os_name: osName } : {}),
      });
      requests.trackProvision({
        request_id: res.request_id,
        origin: "form",
        summary,
        resource_type: type,
        project,
        env,
        ...(type === "ec2" ? { instance_type: instanceType, os_name: osName } : {}),
      });
      toast.success("Request accepted", { description: `Tracking ${res.request_id}. The resource appears in a few minutes.` });
      navigate(`/requests/${encodeURIComponent(res.request_id)}`);
    } catch (err) {
      toast.error("Request not sent", { description: err instanceof ApiError ? err.message : String(err) });
      setReviewOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const rows: [string, string][] = [
    ["Type", type === "ec2" ? "EC2 instance" : "S3 bucket"],
    ["Project", project],
    ["Environment", env],
    ...(type === "ec2" ? ([["Instance type", instanceType], ["Operating system", osLabel(osName)]] as [string, string][]) : []),
    ["Name", `${project}-${env}-<n>${type === "s3" ? " (plus the account's bucket suffix, if set)" : ""}`],
    ["Request ID", requestId],
    ["Requested by", requester],
    ["Approver", APPROVER],
  ];

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" /> Request a resource
        </CardTitle>
        <CardDescription>The request becomes a Terraform file in the GitOps repo; CodeBuild applies it.</CardDescription>
      </CardHeader>
      <CardContent>
        {fromAssistant && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            Pre-filled from the assistant's proposal. Check the details, then submit.
          </div>
        )}
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) setReviewOpen(true);
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Resource type</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Resource type">
              {(
                [
                  { value: "ec2", label: "EC2", hint: "Virtual server", icon: Server },
                  { value: "s3", label: "S3", hint: "Storage bucket", icon: Database },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={type === opt.value}
                  onClick={() => onTypeChange(opt.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    type === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                  )}
                >
                  <opt.icon className={cn("h-5 w-5", type === opt.value ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="project">Project</Label>
              <Input
                id="project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. billing"
                autoComplete="off"
                aria-invalid={touched && !projectValid}
                aria-describedby="project-hint"
              />
              <p id="project-hint" className={cn("text-xs", touched && !projectValid ? "text-destructive" : "text-muted-foreground")}>
                {touched && !projectValid ? PROJECT_RULE : projectValid ? `The resource will be named ${project}-${env}-<n>.` : PROJECT_RULE}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={env} onValueChange={setEnv}>
                <SelectTrigger aria-label="Environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {environments.length === 1 && <p className="text-xs text-muted-foreground">Only {environments[0]} is available for now.</p>}
            </div>

            {type === "ec2" && (
              <>
                <div className="space-y-1.5">
                  <Label>Instance type</Label>
                  <Select value={instanceType} onValueChange={setInstanceType}>
                    <SelectTrigger aria-label="Instance type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {instanceTypes.map((i) => (
                        <SelectItem key={i} value={i}>
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Operating system</Label>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Operating system">
                    {OS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={osName === o.value}
                        onClick={() => setOsName(o.value)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          osName === o.value ? "border-primary bg-primary/5 font-medium ring-1 ring-primary" : "hover:bg-muted",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="request-id">Request ID</Label>
              <div className="flex gap-2">
                <Input
                  id="request-id"
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value.trim())}
                  className="font-mono"
                  autoComplete="off"
                  aria-invalid={!requestIdValid || requestIdUsed}
                  aria-describedby="request-id-hint"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setRequestId(newRequestId())} aria-label="Generate a new request ID" title="Generate a new request ID">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p id="request-id-hint" className={cn("text-xs", !requestIdValid || requestIdUsed ? "text-destructive" : "text-muted-foreground")}>
                {!requestIdValid
                  ? REQUEST_ID_RULE
                  : requestIdUsed
                    ? "This request ID was already used — generate a new one."
                    : "Your handle for tracking this request. You can use a ticket number instead; it must be unique."}
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Requested by</Label>
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">{requester} (you)</p>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            <Rocket className="h-4 w-4" /> Review request
          </Button>
        </form>
      </CardContent>

      <AlertDialog open={reviewOpen} onOpenChange={(o) => !submitting && setReviewOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this request?</AlertDialogTitle>
            <AlertDialogDescription>This creates real AWS infrastructure a few minutes after you submit.</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="divide-y rounded-lg border text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className={cn("break-all", k === "Request ID" && "font-mono")}>{v}</dd>
              </div>
            ))}
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
