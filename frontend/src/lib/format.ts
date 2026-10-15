import type { GroupBy, Resource } from "./api";

// ── Resource records ─────────────────────────────────────────────────────────

/** Split project_env: "jade#environments/dev/ec2" (current) or "jade#dev" (older records).
 *  Falls back to the resource name ("<project>-<env>-<n>"). */
export function projectEnv(resource: Resource): { project: string; env: string } {
  const raw = typeof resource.project_env === "string" ? resource.project_env : "";
  if (raw.includes("#")) {
    const [project, rest = ""] = raw.split("#");
    const parts = rest.split("/").filter(Boolean);
    const env = parts[0] === "environments" ? parts[1] : parts[0];
    return { project: project || "—", env: (env || "—").toLowerCase() };
  }
  const match = /^(.*)-(dev|qa|stage|uat|prod|staging)-\d+$/i.exec(resource.resource_id || "");
  if (match) return { project: match[1], env: match[2].toLowerCase() };
  return { project: raw || "—", env: "—" };
}

export type StatusTone = "good" | "warning" | "serious" | "critical" | "neutral";

export type StatusMeta = { label: string; tone: StatusTone };

/** Map a registry status onto the reserved status palette. ACTIVE is the only value the
 *  current pipeline writes; PENDING_PROVISION comes from records of the previous pipeline. */
export function statusMeta(status: string | undefined): StatusMeta {
  const s = (status || "").toUpperCase();
  if (["ACTIVE", "PROVISIONED", "RUNNING", "AVAILABLE", "SUCCEEDED", "COMPLETED"].includes(s))
    return { label: "Active", tone: "good" };
  if (s.includes("DELET")) return { label: s === "DELETED" ? "Deleted" : "Deleting", tone: "serious" };
  if (s.includes("FAIL") || s.includes("ERROR")) return { label: "Failed", tone: "critical" };
  if (s.includes("PENDING") || s.includes("PROGRESS") || s.includes("QUEUED")) return { label: "Pending", tone: "warning" };
  return { label: s ? titleCase(s) : "Unknown", tone: "neutral" };
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function resourceTypeLabel(type: string) {
  const t = type.toLowerCase();
  if (t === "ec2") return "EC2 instance";
  if (t === "s3") return "S3 bucket";
  return type.toUpperCase();
}

// ── Money and numbers ────────────────────────────────────────────────────────

const moneyFormats = new Map<string, Intl.NumberFormat>();

/** Plain numbers rounded to 2 decimals, formatted with the response's currency (spec §2). */
export function money(amount: number | null | undefined, currency = "USD") {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  let f = moneyFormats.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormats.set(currency, f);
  }
  return f.format(amount);
}

/** Short money for axis ticks: $0, $40, $1.2K. */
export function moneyCompact(amount: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

/** Percentages arrive with 1 decimal; null means "no baseline", not 0. */
export function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

// ── Dates (UTC calendar dates stay dates; never shifted to local time) ────────

function utc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayUtc() {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

export function addDaysUtc(date: string, days: number) {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(start: string, end: string) {
  return Math.round((utc(end).getTime() - utc(start).getTime()) / 86_400_000) + 1;
}

/** "Oct 13" (or "Oct 13, 2025" when not this year). */
export function dateLabel(date: string, opts: { year?: boolean } = {}) {
  const d = utc(date);
  const showYear = opts.year ?? d.getUTCFullYear() !== new Date().getUTCFullYear();
  return d.toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric", ...(showYear ? { year: "numeric" } : {}) });
}

/** "Oct 1–13", "Sep 28 – Oct 3". */
export function periodLabel(start: string, end: string) {
  const a = utc(start);
  const b = utc(end);
  if (start === end) return dateLabel(start);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    const month = a.toLocaleDateString(undefined, { timeZone: "UTC", month: "short" });
    const year = a.getUTCFullYear() !== new Date().getUTCFullYear() ? `, ${a.getUTCFullYear()}` : "";
    return `${month} ${a.getUTCDate()}–${b.getUTCDate()}${year}`;
  }
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string) {
  return utc(`${month}-01`).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "2026-09" → "Sep". */
export function shortMonth(month: string) {
  return utc(`${month}-01`).toLocaleDateString(undefined, { timeZone: "UTC", month: "short" });
}

/** "2026-10" → "2026-09". */
export function previousMonth(month: string) {
  const d = utc(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** "Oct 13" for a day, "Oct 2026" for a month bucket. */
export function shortMonthLabel(date: string) {
  return utc(date).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", year: "numeric" });
}

export function timeAgo(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const time = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(time)) return String(value);
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(time).toLocaleDateString();
}

export function formatDateTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const time = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(time)) return String(value);
  return new Date(time).toLocaleString();
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Cost Explorer names ──────────────────────────────────────────────────────

const SERVICE_NAMES: Record<string, string> = {
  "Amazon Elastic Compute Cloud - Compute": "EC2 - Compute",
  "EC2 - Other": "EC2 - Other",
  "Amazon Relational Database Service": "RDS",
  "Amazon Simple Storage Service": "S3",
  "AWS Lambda": "Lambda",
  AmazonCloudWatch: "CloudWatch",
  "Amazon DynamoDB": "DynamoDB",
  "Amazon Elastic Container Service": "ECS",
  "Amazon Elastic Container Service for Kubernetes": "EKS",
  "Amazon Elastic Kubernetes Service": "EKS",
  "Amazon EC2 Container Registry (ECR)": "ECR",
  "Amazon Virtual Private Cloud": "VPC",
  "Amazon Elastic Load Balancing": "Load Balancing",
  "Elastic Load Balancing": "Load Balancing",
  "Amazon Route 53": "Route 53",
  "Amazon CloudFront": "CloudFront",
  "Amazon API Gateway": "API Gateway",
  "AWS Step Functions": "Step Functions",
  "Amazon Bedrock": "Bedrock",
  "AWS CodeBuild": "CodeBuild",
  "AWS Key Management Service": "KMS",
  "AWS Secrets Manager": "Secrets Manager",
  "Amazon Simple Notification Service": "SNS",
  "Amazon Simple Queue Service": "SQS",
  "Amazon Elastic File System": "EFS",
  "Amazon ElastiCache": "ElastiCache",
  "Amazon OpenSearch Service": "OpenSearch",
  "AWS Cost Explorer": "Cost Explorer",
  "Amazon Managed Service for Prometheus": "Managed Prometheus",
  "Amazon Managed Grafana": "Managed Grafana",
  "Amazon Elastic Block Store": "EBS",
  "AWS Config": "Config",
  "AWS CloudTrail": "CloudTrail",
  "Amazon GuardDuty": "GuardDuty",
  "AWS Glue": "Glue",
  Tax: "Tax",
};

/** Short display name for a Cost Explorer service; keep the full name in a tooltip. */
export function serviceShortName(key: string) {
  return SERVICE_NAMES[key] ?? key.replace(/^Amazon\s+/, "").replace(/^AWS\s+/, "");
}

/** Label for a ranked cost group: short service names, and "(untagged)" as "Not tagged" (issue 9). */
export function groupKeyLabel(key: string, groupBy: GroupBy) {
  if (key === "(untagged)") return "Not tagged";
  if (groupBy === "service") return serviceShortName(key);
  return key;
}

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  service: "Service",
  region: "Region",
  usage_type: "Usage type",
  account: "Account",
  instance_type: "Instance type",
  project: "Project",
  owner: "Owner",
  ticket: "Ticket",
  environment: "Environment",
  managed_by: "Managed by",
  none: "None",
};

/** Groupings that rely on cost allocation tags (may show only "Not tagged" — issue 9). */
export const TAG_GROUPINGS: GroupBy[] = ["project", "owner", "ticket", "environment", "managed_by"];

// ── Regions ──────────────────────────────────────────────────────────────────

export const REGIONS: { code: string; name: string }[] = [
  { code: "us-east-1", name: "US East (N. Virginia)" },
  { code: "us-east-2", name: "US East (Ohio)" },
  { code: "us-west-1", name: "US West (N. California)" },
  { code: "us-west-2", name: "US West (Oregon)" },
  { code: "ca-central-1", name: "Canada (Central)" },
  { code: "eu-west-1", name: "Europe (Ireland)" },
  { code: "eu-west-2", name: "Europe (London)" },
  { code: "eu-central-1", name: "Europe (Frankfurt)" },
  { code: "ap-south-1", name: "Asia Pacific (Mumbai)" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)" },
  { code: "ap-southeast-2", name: "Asia Pacific (Sydney)" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)" },
  { code: "sa-east-1", name: "South America (São Paulo)" },
];

// ── Misc ─────────────────────────────────────────────────────────────────────

export function makeId(prefix = "") {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}${id}` : id;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
