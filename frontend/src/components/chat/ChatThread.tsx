import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ArrowUp, Check, Clock, ExternalLink, Info, ListChecks, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { LogoAvatar, LogoMark } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat, type ActionStatus, type ChatMessage } from "@/contexts/ChatContext";
import { useNow } from "@/hooks/useNow";
import type { PendingAction } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "What users can ask" (spec §4.8). */
export const SUGGESTIONS = [
  "Which EC2 instances and databases are running?",
  "Top services by spend in the last 30 days",
  "Spend by region",
  "Find idle resources",
  "Any rightsizing recommendations?",
  "Create a t3.small Ubuntu instance in dev for project billing",
];

function Markdown({ text }: { text: string }) {
  // react-markdown never renders raw HTML, so agent replies are sanitised by default.
  return (
    <div className="chat-md break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const STATUS_LABEL: Partial<Record<ActionStatus, { label: string; icon: typeof Check }>> = {
  confirmed: { label: "Confirmed", icon: Check },
  cancelled: { label: "Cancelled", icon: X },
  handled: { label: "Already handled", icon: Check },
  expired: { label: "Expired", icon: Clock },
  unavailable: { label: "No longer available", icon: X },
};

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Where "Use the form instead" goes for a proposal (backend issues 1–2: chat changes fail after Confirm). */
function formLink(action: PendingAction) {
  const p = action.params ?? {};
  if (action.kind === "delete") {
    const id = str(p.resource_id) || str(p.name);
    return id ? `/resources?focus=${encodeURIComponent(id)}` : "/resources";
  }
  const q = new URLSearchParams({ from: "assistant" });
  const project = str(p.project) || str(p.name);
  if (project) q.set("project", project);
  if (str(p.resource_type)) q.set("resource_type", str(p.resource_type));
  if (str(p.instance_type)) q.set("instance_type", str(p.instance_type));
  if (str(p.os_name)) q.set("os_name", str(p.os_name));
  if (str(p.env) || str(p.environment)) q.set("env", str(p.env) || str(p.environment));
  return `/provision?${q.toString()}`;
}

function ActionCard({ message, action }: { message: ChatMessage; action: PendingAction }) {
  const { decide, sending } = useChat();
  const navigate = useNavigate();
  const state = message.actionState?.[action.action_id] ?? { status: "open" as ActionStatus };
  const expiresAt = message.at + (action.expires_in ?? 600) * 1000;
  const open = state.status === "open";
  const now = useNow(1000, open);
  const expired = open && now >= expiresAt;
  const isDelete = action.kind === "delete";
  const params = Object.entries(action.params ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const final = STATUS_LABEL[expired ? "expired" : state.status];

  return (
    <div className={cn("rounded-xl border bg-card/75 p-3 shadow-xs backdrop-blur-md", isDelete ? "border-destructive/40" : "border-primary/30", !open && "opacity-80")}>
      <div className="flex items-start gap-2">
        {isDelete ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        ) : (
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isDelete ? "Delete" : "Provision"} proposal · needs your confirmation
          </div>
          <p className="mt-1 text-sm font-medium">{action.summary}</p>
          {params.length > 0 && (
            <table className="mt-2 w-full text-xs">
              <tbody>
                {params.map(([k, v]) => (
                  <tr key={k} className="border-t first:border-0">
                    <th scope="row" className="py-1 pr-3 text-left font-normal text-muted-foreground">
                      {k.replace(/_/g, " ")}
                    </th>
                    <td className="py-1 font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {open && !expired && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warning" aria-hidden />
          <span>
            Known issue: chat-proposed {isDelete ? "deletions" : "provisioning"} currently fail after Confirm.{" "}
            {isDelete ? "Delete it from Resources instead." : "Submit it with the Provision form instead."}
          </span>
        </div>
      )}

      {state.error && open && <p className="mt-2 text-xs text-destructive">{state.error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {final ? (
          <Badge variant={state.status === "confirmed" ? "default" : "secondary"} className="gap-1">
            <final.icon className="h-3 w-3" /> {final.label}
          </Badge>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => navigate(formLink(action))}>
              <ExternalLink className="h-3.5 w-3.5" /> {isDelete ? "Open in Resources" : "Use the form instead"}
            </Button>
            <Button
              size="sm"
              variant={isDelete ? "destructive" : "default"}
              disabled={sending || state.status === "pending"}
              onClick={() => void decide(message.id, action, "confirm")}
            >
              {state.status === "pending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {state.error ? "Retry confirm" : "Confirm"}
            </Button>
            <Button size="sm" variant="ghost" disabled={sending || state.status === "pending"} onClick={() => void decide(message.id, action, "cancel")}>
              Cancel
            </Button>
            <span className="ml-auto text-[11px] text-muted-foreground" aria-live="off">
              expires in {formatDuration(expiresAt - now)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { tracking, checkStatus } = useChat();
  const isUser = message.role === "user";
  const t = message.tracking;
  const watching = message.requestId && tracking.includes(message.requestId);

  return (
    <div className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <LogoAvatar className="mt-0.5" />}
      <div className={cn("min-w-0 max-w-[85%] space-y-2", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "btn-primary-grad whitespace-pre-wrap rounded-br-md"
              : message.error
                ? "rounded-bl-md border border-destructive/30 bg-destructive/10 text-foreground"
                : "rounded-bl-md border border-[color:var(--glass-border)] bg-card/75 shadow-xs backdrop-blur-md",
          )}
        >
          {isUser ? message.text : <Markdown text={message.text} />}
          {t?.state === "failed" && (
            <div className="mt-2 space-y-1.5 text-xs">
              {t.error && <p className="font-medium">{t.error}</p>}
              <p className="text-muted-foreground">
                Changes proposed in chat currently fail on the backend.{" "}
                <Link to="/provision" className="font-medium text-primary underline-offset-2 hover:underline">
                  Use the Provision form
                </Link>{" "}
                for real changes.
              </p>
              {t.cause && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-card p-2 font-mono text-[11px]">{t.cause}</pre>
                </details>
              )}
            </div>
          )}
        </div>
        {message.actions?.map((action) => <ActionCard key={action.action_id} message={message} action={action} />)}
        {message.requestId && !isUser && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {watching && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Watching {message.requestId}…
              </span>
            )}
            <Link to={`/requests/${encodeURIComponent(message.requestId)}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <ListChecks className="h-3.5 w-3.5" /> Open tracker
            </Link>
            {!watching && t?.state !== "failed" && (
              <button type="button" onClick={() => void checkStatus(message.requestId!)} className="inline-flex items-center gap-1 hover:text-foreground">
                <RefreshCw className="h-3.5 w-3.5" /> Check status
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div className="flex items-center gap-2.5">
      <LogoAvatar />
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[color:var(--glass-border)] bg-card/75 px-3.5 py-2.5 text-sm text-muted-foreground backdrop-blur-md">
        <Loader2 className="h-4 w-4 animate-spin" /> {slow ? "Still working — replies can take up to 30 seconds…" : "Thinking…"}
      </div>
    </div>
  );
}

export function ChatThread({ variant = "page" }: { variant?: "page" | "widget" }) {
  const { messages, sending, send } = useChat();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const compact = variant === "widget";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    const text = input;
    setInput("");
    void send(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("flex-1 space-y-4 overflow-y-auto", compact ? "px-3 py-4" : "px-1 py-2 sm:px-4")} aria-live="polite">
        {messages.length === 0 && (
          <div className={cn("mx-auto flex max-w-2xl flex-col items-center text-center", compact ? "pt-2" : "pt-10")}>
            <LogoMark className={cn("drop-shadow-[0_6px_18px_rgba(0,159,248,0.35)]", compact ? "h-14" : "h-24")} />
            <h2 className={cn("mt-4 font-display font-semibold tracking-tight", compact ? "text-base" : "text-3xl")}>
              How can I help with your <span className="text-gradient">AWS</span>?
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Ask about running resources, spend and savings, or the status of a request. Proposed changes always wait for your
              confirmation.
            </p>
            <div className={cn("mt-6 grid w-full gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
              {(compact ? SUGGESTIONS.slice(0, 4) : SUGGESTIONS).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(s)}
                  className="glass-card lift rounded-xl px-3.5 py-3 text-left text-sm disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {sending && <Thinking />}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className={cn(compact ? "border-t border-[color:var(--glass-border)] p-3" : "pt-4")}>
        <div className="glass-card flex items-end gap-2 rounded-2xl p-2 focus-within:ring-4 focus-within:ring-primary/15">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Cloud Brain about your AWS…"
            rows={compact ? 1 : 2}
            aria-label="Message"
            className="max-h-40 min-h-0 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-xl" disabled={sending || !input.trim()} aria-label="Send">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
        {!compact && <p className="mt-2 text-center text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</p>}
      </form>
    </div>
  );
}
