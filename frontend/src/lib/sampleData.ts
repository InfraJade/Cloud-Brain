// Example data from BACKEND-API.md, shown ONLY while an endpoint isn't deployed on AWS
// yet (it answers 404). Every object carries `sample: true`, and every screen that shows
// one says so with a "Sample data" banner. Dates are anchored to today so the preview reads
// like a real month.

import type {
  CostQuery,
  CurrentMonthResponse,
  ForecastResponse,
  GroupBy,
  InventoryResponse,
  RankedItem,
  ReportRequest,
  ReportResponse,
} from "./api";
import { addDaysUtc, daysBetweenInclusive, todayUtc, yesterdayUtc } from "./format";

/** The spec's daily spend for Oct 1–13, repeated as needed. */
const DAILY = [30.12, 29.87, 28.4, 27.95, 31.2, 32.1, 31.75, 30.6, 32.4, 33.15, 34.2, 35.88, 34.75];
const LAST_MONTH_TOTAL = 905.44;

/** Shares (%) per grouping, largest first. */
const GROUPS: Record<GroupBy, [string, number][]> = {
  service: [
    ["Amazon Elastic Compute Cloud - Compute", 48.1],
    ["Amazon Relational Database Service", 23.5],
    ["Amazon Simple Storage Service", 10.0],
    ["AWS Lambda", 5.4],
    ["AmazonCloudWatch", 4.5],
    ["EC2 - Other", 3.9],
    ["Amazon Virtual Private Cloud", 2.6],
    ["Amazon DynamoDB", 2.0],
  ],
  region: [["us-east-1", 91.2], ["ap-south-1", 6.3], ["global", 2.5]],
  usage_type: [["USE1-BoxUsage:t3.medium", 31.4], ["USE1-InstanceUsage:db.t3.medium", 22.0], ["USE1-TimedStorage-ByteHrs", 9.6], ["USE1-EBS:VolumeUsage.gp3", 8.8], ["USE1-Lambda-GB-Second", 5.1], ["Other usage", 23.1]],
  account: [["676278186770", 100]],
  instance_type: [["t3.medium", 41.0], ["t3.small", 22.4], ["m5.large", 19.8], ["t3.micro", 9.1], ["NoInstanceType", 7.7]],
  project: [["(untagged)", 88.5], ["jade", 7.9], ["atlas", 3.6]],
  owner: [["(untagged)", 90.2], ["JaneDoe", 6.1], ["Archan", 3.7]],
  ticket: [["(untagged)", 92.0], ["UI-7F3K9Q2M1A", 5.2], ["HD-1001", 2.8]],
  environment: [["(untagged)", 100]],
  managed_by: [["(untagged)", 89.4], ["chat-ops", 10.6]],
  none: [],
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function rank(groupBy: GroupBy, total: number): RankedItem[] {
  return GROUPS[groupBy].map(([key, share]) => ({ key, amount: round2((total * share) / 100), pct: share }));
}

function monthInfo() {
  const today = todayUtc();
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month: today.slice(0, 7), first: `${today.slice(0, 7)}-01`, day: d, daysInMonth };
}

export function sampleInventory(regions?: string): InventoryResponse {
  const list = regions === "all" ? ["us-east-1", "us-east-2", "us-west-2", "ap-south-1", "eu-west-1"] : [regions || "us-east-1"];
  return {
    sample: true,
    generated_at: new Date().toISOString(),
    regions: list,
    partial: false,
    cached: false,
    services: [
      { key: "ec2", label: "EC2 instances", count: 14, details: { running: 9, stopped: 4, other: 1, chatops_managed: 3 }, complete: true, scope: "regional" },
      { key: "rds", label: "RDS databases", count: 3, details: { available: 2, stopped: 1, other: 0 }, complete: true, scope: "regional" },
      { key: "eks", label: "EKS clusters", count: 1, details: {}, complete: true, scope: "regional" },
      { key: "ecs", label: "ECS clusters", count: 2, details: { services: 6, running_tasks: 11, pending_tasks: 0 }, complete: true, scope: "regional" },
      { key: "lambda", label: "Lambda functions", count: 42, details: {}, complete: true, scope: "regional" },
      { key: "dynamodb", label: "DynamoDB tables", count: 8, details: {}, complete: true, scope: "regional" },
      { key: "s3", label: "S3 buckets", count: 27, details: {}, complete: true, scope: "global" },
    ],
    by_region: { [list[0]]: { ec2: 14, rds: 3, eks: 1, ecs: 2, lambda: 42, dynamodb: 8 } },
    errors: [],
  };
}

export function sampleCostCurrent(q: CostQuery = {}): CurrentMonthResponse {
  const { month, first, day, daysInMonth } = monthInfo();
  const groupBy = q.group_by ?? "service";
  const elapsed = day - 1; // today is never included
  const daily = Array.from({ length: elapsed }, (_, i) => ({ date: addDaysUtc(first, i), amount: DAILY[i % DAILY.length] }));
  const total = round2(daily.reduce((s, d) => s + d.amount, 0));
  const base = {
    sample: true,
    action: "current_month" as const,
    month,
    days_elapsed: elapsed,
    days_in_month: daysInMonth,
    currency: "USD",
    metric: q.metric ?? "UnblendedCost",
    filters: q.filters ?? {},
    exclude_credits: Boolean(q.exclude_credits),
    last_month_total: LAST_MONTH_TOTAL,
    group_by: groupBy,
    estimated: true,
    as_of: new Date().toISOString(),
    cached: false,
  };
  if (elapsed === 0) {
    return { ...base, period: null, total: 0, average_per_day: 0, same_days_last_month: 0, change_pct: null, top: [], daily: [], note: "No complete day yet this month — figures start tomorrow." };
  }
  const sameDays = round2(total / 1.085);
  return {
    ...base,
    period: { start: first, end: yesterdayUtc() },
    total,
    average_per_day: round2(total / elapsed),
    same_days_last_month: sameDays,
    change_pct: 8.5,
    top: rank(groupBy, total),
    daily,
  };
}

export function sampleForecast(q: CostQuery = {}): ForecastResponse {
  const current = sampleCostCurrent({ ...q, group_by: "none" });
  const { daysInMonth, day } = monthInfo();
  const daysRemaining = daysInMonth - day + 1; // including today
  const remaining = round2((current.average_per_day || DAILY[0]) * daysRemaining * 1.03);
  const projected = round2(current.total + remaining);
  return {
    sample: true,
    action: "forecast",
    month: current.month,
    currency: "USD",
    metric: current.metric,
    filters: current.filters,
    exclude_credits: current.exclude_credits,
    month_to_date: current.total,
    days_remaining: daysRemaining,
    last_month_total: LAST_MONTH_TOTAL,
    forecast_available: true,
    forecast_remaining: remaining,
    projected_month_end: projected,
    prediction_interval: { level: 80, low: round2(projected * 0.936), high: round2(projected * 1.064) },
    change_vs_last_month_pct: Math.round(((projected - LAST_MONTH_TOTAL) / LAST_MONTH_TOTAL) * 1000) / 10,
    as_of: new Date().toISOString(),
    cached: false,
  };
}

function presetRange(period: string): { start: string; end: string } {
  const y = yesterdayUtc();
  const { first } = monthInfo();
  switch (period) {
    case "last_month": {
      const end = addDaysUtc(first, -1);
      return { start: `${end.slice(0, 7)}-01`, end };
    }
    case "last_7_days":
      return { start: addDaysUtc(y, -6), end: y };
    case "last_30_days":
      return { start: addDaysUtc(y, -29), end: y };
    case "last_90_days":
      return { start: addDaysUtc(y, -89), end: y };
    default:
      return { start: first, end: y };
  }
}

export function sampleReport(req: ReportRequest): ReportResponse {
  const range = req.period ? presetRange(req.period) : { start: req.start_date!, end: req.end_date! };
  let note: string | undefined;
  if (range.end > yesterdayUtc()) {
    range.end = yesterdayUtc();
    note = "The end date was moved back to yesterday (UTC): today isn't complete yet.";
  }
  const days = Math.max(1, daysBetweenInclusive(range.start, range.end));
  const granularity = req.granularity ?? "DAILY";
  const groupBy = req.group_by ?? "service";
  const daily = Array.from({ length: days }, (_, i) => ({ date: addDaysUtc(range.start, i), amount: DAILY[i % DAILY.length] }));

  let trend: ReportResponse["trend"];
  if (granularity === "MONTHLY") {
    const buckets = new Map<string, { start: string; end: string; amount: number }>();
    for (const d of daily) {
      const key = d.date.slice(0, 7);
      const b = buckets.get(key) ?? { start: d.date, end: d.date, amount: 0 };
      b.end = d.date;
      b.amount = round2(b.amount + d.amount);
      buckets.set(key, b);
    }
    trend = [...buckets.values()];
  } else {
    trend = daily.map((d) => ({ start: d.date, end: d.date, amount: d.amount }));
  }
  const total = round2(daily.reduce((s, d) => s + d.amount, 0));
  const top = rank(groupBy, total);
  const filters: ReportResponse["filters"] = {};
  for (const key of ["project", "environment", "service"] as const) {
    const v = req[key];
    if (v) filters[key] = Array.isArray(v) ? v : [v];
  }
  return {
    sample: true,
    action: "report",
    generated_at: new Date().toISOString(),
    period: range,
    days,
    granularity,
    group_by: groupBy,
    metric: req.metric ?? "UnblendedCost",
    filters,
    exclude_credits: Boolean(req.exclude_credits),
    currency: "USD",
    total,
    average_per_day: round2(total / days),
    estimated: range.end >= monthInfo().first,
    group_count: top.length,
    top,
    trend,
    ...(note ? { note } : {}),
    files: null,
    files_note: "Downloads aren't available for sample data — they appear once POST /cost/report is deployed.",
  };
}
