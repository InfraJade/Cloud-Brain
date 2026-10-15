import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, type AgentResponse, type PendingAction, type Tracking } from "@/lib/api";
import { makeId } from "@/lib/format";
import { readJson, writeJson } from "@/lib/storage";
import { useAuth } from "./AuthContext";
import { usePrefs } from "./PrefsContext";
import { useRequests } from "./RequestsContext";

// One conversation with the AI assistant (POST /agent, spec §4.8), shared by the floating
// widget and the Assistant page. The agent issues the session_id on the first reply; it is
// kept in sessionStorage and sent with every later message (the server remembers the last
// 10 exchanges for 24 hours).

const TRACK_INTERVAL_MS = 5_000; // poll every 5 s while in_progress
const TRACK_MAX_POLLS = 120; // ~10 minutes

export type ActionStatus = "open" | "pending" | "confirmed" | "cancelled" | "handled" | "expired" | "unavailable";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  error?: boolean;
  actions?: PendingAction[];
  actionState?: Record<string, { status: ActionStatus; error?: string }>;
  /** A tracking result to render (failure details, links). */
  tracking?: Tracking;
  /** Request this message is about, for a link to its tracker. */
  requestId?: string;
};

type ChatState = {
  sessionId?: string;
  messages: ChatMessage[];
  /** Request IDs confirmed in this conversation, announced in chat when they finish. */
  tracked: string[];
  announced: string[];
};

type ChatContextValue = {
  messages: ChatMessage[];
  sessionId?: string;
  sending: boolean;
  tracking: string[]; // request IDs being polled on the agent right now
  send: (text: string) => Promise<void>;
  decide: (messageId: string, action: PendingAction, decision: "confirm" | "cancel") => Promise<void>;
  checkStatus: (requestId: string) => Promise<void>;
  reset: () => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function errorText(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 502) return `The assistant couldn't complete that (${err.message}). Please try again.`;
    if (err.status === 503 || err.status === 504) return "The assistant took too long to answer. Try again, or ask a shorter question.";
    return err.message;
  }
  return (err as Error)?.message || "The assistant is unavailable.";
}

/** Mounted per user (keyed by email in App). */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const requests = useRequests();
  const storageKey = `cb_chat_${user?.email ?? "anon"}`;

  const [state, setState] = useState<ChatState>(() => {
    const saved = readJson<Partial<ChatState>>(storageKey, {}, "session");
    return { sessionId: saved.sessionId, messages: saved.messages ?? [], tracked: saved.tracked ?? [], announced: saved.announced ?? [] };
  });
  const [sending, setSending] = useState(false);
  const [tracking, setTracking] = useState<string[]>([]);

  const sessionRef = useRef(state.sessionId);
  sessionRef.current = state.sessionId;
  const requestsRef = useRef(requests);
  requestsRef.current = requests;
  const autoTrackRef = useRef(prefs.autoTrack);
  autoTrackRef.current = prefs.autoTrack;
  const pollingRef = useRef(new Set<string>());
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => writeJson(storageKey, state, "session"), [storageKey, state]);

  const push = useCallback((msg: Omit<ChatMessage, "id" | "at">) => {
    setState((s) => ({ ...s, messages: [...s.messages, { ...msg, id: makeId(), at: Date.now() }] }));
  }, []);

  const setActionState = useCallback((messageId: string, actionId: string, value: { status: ActionStatus; error?: string }) => {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, actionState: { ...m.actionState, [actionId]: value } } : m)),
    }));
  }, []);

  const keepSession = useCallback((res: Pick<AgentResponse, "session_id">) => {
    if (res.session_id && res.session_id !== sessionRef.current) {
      sessionRef.current = res.session_id;
      setState((s) => ({ ...s, sessionId: res.session_id }));
    }
  }, []);

  /** A workflow result from the agent: update the request and tell the user. */
  const applyTracking = useCallback(
    (t: Tracking) => {
      const entry = requestsRef.current.get(t.request_id);
      if (t.state === "failed") {
        requestsRef.current.update(t.request_id, { state: "failed", error: t.error ?? t.workflow_status, cause: t.cause });
        push({ role: "assistant", error: true, tracking: t, requestId: t.request_id, text: `**Request ${t.request_id} failed** (${t.workflow_status ?? "workflow failed"}).` });
        return;
      }
      if (t.state === "done") {
        const active = (t.resources ?? []).filter((r) => String(r.status).toUpperCase() === "ACTIVE");
        if (active.length) {
          requestsRef.current.update(t.request_id, { state: "active", resources: t.resources, resource_id: active.map((r) => r.resource_id).join(", ") });
          return; // announced by the effect below
        }
        if (entry && entry.state === "submitted") requestsRef.current.update(t.request_id, { state: "committed" });
        push({
          role: "assistant",
          requestId: t.request_id,
          text:
            entry?.delete_requested_at !== undefined
              ? `Deletion **${t.request_id}** was submitted. The resource disappears once Terraform has destroyed it — I'll let you know.`
              : `The configuration for **${t.request_id}** is committed. Terraform is creating the resource now — usually a few minutes. I'll let you know when it's active.`,
        });
      }
    },
    [push],
  );

  const pollAgent = useCallback(
    async (requestId: string) => {
      if (pollingRef.current.has(requestId)) return;
      pollingRef.current.add(requestId);
      setTracking([...pollingRef.current]);
      try {
        for (let i = 0; i < TRACK_MAX_POLLS; i++) {
          await new Promise((r) => setTimeout(r, TRACK_INTERVAL_MS));
          if (!aliveRef.current) return;
          const res = await api.agent({ status_request_id: requestId }, sessionRef.current);
          if (res.tracking && res.tracking.state !== "in_progress") {
            applyTracking(res.tracking);
            return;
          }
        }
        push({ role: "assistant", requestId, text: `Request **${requestId}** is still running. You can follow it on its tracker page.` });
      } catch (err) {
        push({ role: "assistant", error: true, requestId, text: `Couldn't check request ${requestId}: ${errorText(err)}` });
      } finally {
        pollingRef.current.delete(requestId);
        if (aliveRef.current) setTracking([...pollingRef.current]);
      }
    },
    [applyTracking, push],
  );

  const handleResponse = useCallback(
    (res: AgentResponse) => {
      keepSession(res);
      if (res.reply) push({ role: "assistant", text: res.reply, actions: res.actions?.length ? res.actions : undefined });
      if (res.tracking) {
        if (res.tracking.state === "in_progress") {
          if (autoTrackRef.current) void pollAgent(res.tracking.request_id);
        } else {
          applyTracking(res.tracking);
        }
      }
      if (!res.reply && !res.tracking) push({ role: "assistant", text: "_The assistant returned an empty response._" });
    },
    [keepSession, push, pollAgent, applyTracking],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      push({ role: "user", text: trimmed });
      setSending(true);
      try {
        handleResponse(await api.agent({ message: trimmed }, sessionRef.current));
      } catch (err) {
        push({ role: "assistant", error: true, text: errorText(err) });
      } finally {
        setSending(false);
      }
    },
    [sending, push, handleResponse],
  );

  const decide = useCallback(
    async (messageId: string, action: PendingAction, decision: "confirm" | "cancel") => {
      // Disable both buttons straight away to prevent double submits.
      setActionState(messageId, action.action_id, { status: "pending" });
      setSending(true);
      try {
        const res = await api.agent({ action_id: action.action_id, decision }, sessionRef.current);
        setActionState(messageId, action.action_id, { status: decision === "confirm" ? "confirmed" : "cancelled" });
        if (decision === "confirm") {
          const p = action.params ?? {};
          const requestId = res.tracking?.request_id ?? action.action_id;
          if (action.kind === "delete") {
            const resourceId = str(p.resource_id) ?? str(p.name);
            requestsRef.current.trackProvision({
              request_id: requestId,
              origin: "assistant",
              summary: action.summary,
              resource_type: str(p.resource_type),
              resource_id: resourceId,
              delete_requested_at: Date.now(),
              delete_ticket_id: requestId,
              state: "deleting",
            });
          } else {
            requestsRef.current.trackProvision({
              request_id: requestId,
              origin: "assistant",
              summary: action.summary,
              resource_type: str(p.resource_type),
              project: str(p.project) ?? str(p.name),
              env: str(p.env) ?? str(p.environment),
              instance_type: str(p.instance_type),
              os_name: str(p.os_name),
            });
          }
          setState((s) => ({ ...s, tracked: [...s.tracked.filter((id) => id !== requestId), requestId] }));
        }
        handleResponse(res);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 409) {
          setActionState(messageId, action.action_id, { status: "handled" }); // double click — ignore
        } else if (status === 410) {
          setActionState(messageId, action.action_id, { status: "expired" });
          push({ role: "assistant", text: (err as Error).message || "This request expired. Ask me again." });
        } else if (status === 404) {
          setActionState(messageId, action.action_id, { status: "unavailable" });
          push({ role: "assistant", error: true, text: "I couldn't find that proposal any more (it may belong to another session). Please ask me again." });
        } else {
          setActionState(messageId, action.action_id, { status: "open", error: errorText(err) });
        }
      } finally {
        setSending(false);
      }
    },
    [setActionState, handleResponse, push],
  );

  const checkStatus = useCallback(
    async (requestId: string) => {
      try {
        const res = await api.agent({ status_request_id: requestId }, sessionRef.current);
        keepSession(res);
        if (res.tracking && res.tracking.state !== "in_progress") applyTracking(res.tracking);
        else push({ role: "assistant", requestId, text: `Request **${requestId}** is still in progress.` });
      } catch (err) {
        push({ role: "assistant", error: true, requestId, text: `Couldn't check request ${requestId}: ${errorText(err)}` });
      }
    },
    [keepSession, applyTracking, push],
  );

  // Announce in chat when a request confirmed here finishes (the request tracker watches the registry).
  useEffect(() => {
    for (const id of state.tracked) {
      if (state.announced.includes(id)) continue;
      const r = requests.get(id);
      if (!r) continue;
      let text: string | null = null;
      if (r.state === "active") text = `**${r.resource_id ?? id}** is active.`;
      else if (r.state === "deleted") text = `**${r.resource_id ?? id}** was deleted.`;
      else if (r.state === "timed_out")
        text = `No result for **${id}** after 20 minutes. Please contact the platform team with this request ID.`;
      if (text) {
        const message = text;
        setState((s) => ({
          ...s,
          announced: [...s.announced, id],
          messages: [...s.messages, { id: makeId(), at: Date.now(), role: "assistant", text: message, requestId: id }],
        }));
      }
    }
  }, [requests, state.tracked, state.announced]);

  const reset = useCallback(() => {
    sessionRef.current = undefined;
    setState({ sessionId: undefined, messages: [], tracked: [], announced: [] });
  }, []);

  const value = useMemo(
    () => ({ messages: state.messages, sessionId: state.sessionId, sending, tracking, send, decide, checkStatus, reset }),
    [state.messages, state.sessionId, sending, tracking, send, decide, checkStatus, reset],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
