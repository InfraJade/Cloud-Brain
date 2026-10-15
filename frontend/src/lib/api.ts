// CLOUD BRAIN API client — the only place the frontend talks to the network.
// Every call goes to the CLOUD BRAIN backend (/api/v1/*), which proxies to the AWS
// Cloud Brain API (docs/BACKEND-API.md). The browser never calls AWS directly: there is
// no CORS on the API Gateway, and the AWS read credentials stay on the server.

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";
const AUTH_KEY = "cb_auth";

/** /agent can take 5–25 s and API Gateway cuts requests at 30 s (spec §2: client timeout 35 s). */
export const AGENT_TIMEOUT_MS = 40_000;
const DEFAULT_TIMEOUT_MS = 35_000;

// ── Auth ─────────────────────────────────────────────────────────────────────

export type Role = "admin" | "operator";

export type User = {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
};

export type AuthSession = {
  access_token: string;
  expires_at: number; // epoch ms
  user: User;
};

// ── Resource registry (§6) ───────────────────────────────────────────────────

export type ResourceType = "ec2" | "s3";

/** One record of the aws-ops-resources table. New records are always status ACTIVE and
 *  project_env "<project>#environments/<env>/<type>"; older ones from the previous pipeline
 *  carry status PENDING_PROVISION and project_env "<project>#<env>". */
export type Resource = {
  resource_id: string;
  request_id: string;
  project_env?: string;
  resource_type: ResourceType | string;
  status: string;
  requester_name?: string;
  approver_name?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type ResourceList = {
  resources: Resource[];
  source: "dynamodb" | "unavailable";
  message: string;
};

export type StatusLookup = {
  request_id: string | null;
  resource_id: string | null;
  found: boolean;
  resources: Resource[];
};

export type CloudConfig = {
  endpoint: string;
  agent_endpoint: string;
  region: string;
  dynamodb_table: string;
  direct_read_configured: boolean;
  api_key_configured: boolean;
  resource_types: ResourceType[];
  environments: string[];
  instance_types: string[];
  os_options: string[];
};

// ── Provision / delete (§4.5, §4.7) ──────────────────────────────────────────

export type ProvisionRequest = {
  project: string;
  resource_type: ResourceType;
  request_id: string;
  env?: string;
  instance_type?: string;
  os_name?: string;
};

export type ProvisionReceipt = {
  status: "accepted";
  request_id: string;
  execution_arn?: string;
  message: string;
};

export type DeleteRequest = {
  delete_ticket_id: string;
  resource_id?: string; // preferred: exact
  request_id?: string; // or the provisioning request ID (deletes only the first resource)
  resource_type?: string; // fallback only
  env?: string; // fallback only
};

export type DeleteReceipt = {
  status: "accepted";
  resource_id: string | null;
  request_id: string | null;
  delete_ticket_id: string;
  message: string;
};

// ── Inventory (§4.1) ─────────────────────────────────────────────────────────

export type ServiceKey = "ec2" | "rds" | "eks" | "ecs" | "lambda" | "dynamodb" | "s3";

export type ServiceCount = {
  key: ServiceKey;
  label: string;
  count: number;
  /** ec2: running, stopped, other, chatops_managed · rds: available, stopped, other
   *  ecs: services, running_tasks, pending_tasks · others: {} */
  details: Record<string, number>;
  complete: boolean;
  scope: "regional" | "global";
};

/** `sample` is set by the UI when the endpoint isn't deployed and example data is shown. */
type MaybeSample = { sample?: boolean };

export type InventoryResponse = MaybeSample & {
  generated_at: string;
  regions: string[];
  partial: boolean;
  cached: boolean;
  services: ServiceCount[];
  by_region: Record<string, Partial<Record<ServiceKey, number>>>;
  errors: { service: ServiceKey; region: string; error: string }[];
};

// ── Cost (§4.2–4.4) ──────────────────────────────────────────────────────────

export type GroupBy =
  | "service" | "region" | "usage_type" | "account" | "instance_type"
  | "project" | "owner" | "ticket" | "environment" | "managed_by" | "none";
export type FilterKey = Exclude<GroupBy, "none">;
export type Metric = "UnblendedCost" | "AmortizedCost" | "NetUnblendedCost" | "NetAmortizedCost" | "BlendedCost";
export type CostFilters = Partial<Record<FilterKey, string[]>>;
export type RankedItem = { key: string; amount: number; pct: number | null };

export type CostQuery = {
  group_by?: GroupBy;
  metric?: Metric;
  exclude_credits?: boolean;
  filters?: CostFilters;
};

export type CurrentMonthResponse = MaybeSample & {
  action: "current_month";
  month: string; // "2026-10"
  period: { start: string; end: string } | null; // null on the 1st of the month
  days_elapsed: number;
  days_in_month: number;
  currency: string;
  metric: Metric;
  filters: CostFilters;
  exclude_credits: boolean;
  total: number;
  average_per_day: number;
  same_days_last_month: number;
  change_pct: number | null;
  last_month_total: number;
  group_by: GroupBy;
  top: RankedItem[];
  daily: { date: string; amount: number }[];
  estimated: boolean;
  note?: string;
  as_of: string;
  cached: boolean;
};

export type ForecastResponse = MaybeSample & {
  action: "forecast";
  month: string;
  currency: string;
  metric: Metric;
  filters: CostFilters;
  exclude_credits: boolean;
  month_to_date: number;
  days_remaining: number;
  last_month_total: number;
  forecast_available: boolean;
  /** present only when forecast_available is true */
  forecast_remaining?: number;
  projected_month_end?: number;
  prediction_interval?: { level: number; low: number; high: number };
  change_vs_last_month_pct?: number | null;
  /** present when forecast_available is false */
  note?: string;
  as_of: string;
  cached: boolean;
};

export type ReportPeriod = "this_month" | "last_month" | "last_7_days" | "last_30_days" | "last_90_days";

export type ReportRequest = {
  start_date?: string; // YYYY-MM-DD, inclusive
  end_date?: string; // YYYY-MM-DD, inclusive
  period?: ReportPeriod; // instead of the two dates
  group_by?: GroupBy;
  granularity?: "DAILY" | "MONTHLY";
  metric?: Metric;
  exclude_credits?: boolean;
} & Partial<Record<FilterKey, string | string[]>>;

export type ReportFile = { s3_uri: string; url: string; expires_in: number };

export type ReportResponse = MaybeSample & {
  action: "report";
  generated_at: string;
  period: { start: string; end: string };
  days: number;
  granularity: "DAILY" | "MONTHLY";
  group_by: GroupBy;
  metric: Metric;
  filters: CostFilters;
  exclude_credits: boolean;
  currency: string;
  total: number;
  average_per_day: number;
  estimated: boolean;
  group_count: number;
  top: RankedItem[];
  trend: { start: string; end: string; amount: number }[];
  note?: string;
  files: { csv: ReportFile; html: ReportFile } | null;
  files_note?: string;
};

// ── Assistant (§4.8) ─────────────────────────────────────────────────────────

export type PendingAction = {
  action_id: string;
  kind: "provision" | "delete" | string;
  summary: string;
  params?: Record<string, unknown>;
  expires_in?: number; // seconds (10 minutes)
};

export type Tracking = {
  request_id: string;
  state: "in_progress" | "done" | "failed";
  workflow_status?: string; // RUNNING | SUCCEEDED | FAILED | TIMED_OUT | ABORTED | NOT_FOUND
  result?: unknown;
  error?: string;
  cause?: string;
  resources?: Resource[];
  resources_lookup_error?: string;
};

export type AgentResponse = {
  session_id: string;
  reply?: string; // Markdown
  actions?: PendingAction[];
  tracking?: Tracking;
};

export type AgentRequest =
  | { message: string }
  | { action_id: string; decision: "confirm" | "cancel" }
  | { status_request_id: string };

// ── Session storage ──────────────────────────────────────────────────────────

export function loadSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthSession;
    if (!session?.access_token || !session.user || Date.now() >= session.expires_at) {
      window.localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null) {
  try {
    if (session) window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(AUTH_KEY);
  } catch {
    // storage unavailable (private mode) — the session just won't survive a reload
  }
}

// ── Transport ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  /** The AWS route isn't deployed yet (API Gateway answered 404 "Not Found"). */
  notDeployed: boolean;
  constructor(message: string, status: number, notDeployed = false) {
    super(message);
    this.status = status;
    this.notDeployed = notDeployed;
  }
}

/** Called on any 401 so the app can drop the session and return to /login. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type RequestOptions = { auth?: boolean; timeoutMs?: number };

async function request<T>(path: string, init: RequestInit = {}, { auth = true, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const session = loadSession();
    if (session) headers.Authorization = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) }, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ApiError("The request timed out. Please try again.", 504);
    throw new ApiError("Can't reach the CLOUD BRAIN server. Is the backend running?", 0);
  } finally {
    window.clearTimeout(timer);
  }

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    const detail = data?.detail;
    const message =
      (typeof detail === "string" && detail) ||
      (detail && typeof detail.message === "string" && detail.message) ||
      (typeof data?.error === "string" && data.error) ||
      defaultMessage(response.status);
    if (response.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(message, response.status, Boolean(detail?.not_deployed));
  }
  return data as T;
}

function defaultMessage(status: number) {
  if (status === 429) return "Too many requests — please wait a moment and try again.";
  if (status === 503 || status === 504) return "The service timed out. Please try again.";
  return `Request failed (${status}).`;
}

function costParams(q: CostQuery, allowGroupBy: boolean) {
  const params = new URLSearchParams();
  if (allowGroupBy && q.group_by) params.set("group_by", q.group_by);
  if (q.metric && q.metric !== "UnblendedCost") params.set("metric", q.metric);
  if (q.exclude_credits) params.set("exclude_credits", "true");
  for (const [key, values] of Object.entries(q.filters ?? {})) {
    if (values && values.length) params.set(key, values.join(","));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const api = {
  health: () => request<{ status: string; service?: string }>("/healthz", {}, { auth: false, timeoutMs: 10_000 }),

  login: async (email: string, password: string): Promise<AuthSession> => {
    const res = await request<{ access_token: string; expires_in: number; user: User }>(
      "/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      { auth: false },
    );
    return { access_token: res.access_token, user: res.user, expires_at: Date.now() + res.expires_in * 1000 };
  },

  me: () => request<User>("/v1/auth/me"),

  config: () => request<CloudConfig>("/v1/chatops/config"),

  // Registry
  listResources: () => request<ResourceList>("/v1/chatops/resources"),
  status: (by: { request_id: string } | { resource_id: string }) => {
    const qs = new URLSearchParams(by as Record<string, string>).toString();
    return request<StatusLookup>(`/v1/chatops/status?${qs}`);
  },

  // Changes (asynchronous on AWS)
  provision: (body: ProvisionRequest) =>
    request<ProvisionReceipt>("/v1/chatops/provision", { method: "POST", body: JSON.stringify(body) }),
  deleteResource: (body: DeleteRequest) =>
    request<DeleteReceipt>("/v1/chatops/resources", { method: "DELETE", body: JSON.stringify(body) }),

  // Assistant — session_id is omitted until the agent has issued one.
  agent: (body: AgentRequest, sessionId?: string) =>
    request<AgentResponse>(
      "/v1/chatops/agent",
      { method: "POST", body: JSON.stringify(sessionId ? { ...body, session_id: sessionId } : body) },
      { timeoutMs: AGENT_TIMEOUT_MS },
    ),

  // Inventory and cost
  inventory: (regions?: string) =>
    request<InventoryResponse>(`/v1/cloud/inventory${regions ? `?regions=${encodeURIComponent(regions)}` : ""}`),
  costCurrent: (q: CostQuery = {}) => request<CurrentMonthResponse>(`/v1/cloud/cost/current${costParams(q, true)}`),
  costForecast: (q: CostQuery = {}) => request<ForecastResponse>(`/v1/cloud/cost/forecast${costParams(q, false)}`),
  costReport: (body: ReportRequest) =>
    request<ReportResponse>("/v1/cloud/cost/report", { method: "POST", body: JSON.stringify(body) }),
};
