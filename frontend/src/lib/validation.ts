// Form rules — these mirror the backend's checks exactly (BACKEND-API.md §7).
// Validating in the UI is required: POST /provision is asynchronous and never returns
// validation errors (a bad request just fails in the background).

export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{3,64}$/;
export const PERSON_RE = /^[A-Za-z0-9 ._@-]{1,64}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PROJECT_RULE = "3–30 characters: lowercase letters, digits and hyphens, starting and ending with a letter or digit.";
export const REQUEST_ID_RULE = "3–64 characters from A–Z, a–z, 0–9 and . _ : -";

export const INSTANCE_TYPES = [
  "t2.micro", "t2.small", "t2.medium",
  "t3.micro", "t3.small", "t3.medium", "t3.large",
  "t3a.micro", "t3a.small", "t3a.medium",
  "m5.large", "m5.xlarge",
] as const;

export const OS_OPTIONS = [
  { value: "ubuntu", label: "Ubuntu 22.04" },
  { value: "windows", label: "Windows Server 2022" },
  { value: "amazonlinux23", label: "Amazon Linux 2023" },
] as const;

export function osLabel(value: string | undefined) {
  return OS_OPTIONS.find((o) => o.value === value)?.label ?? value ?? "—";
}

/** Only dev exists in the Terraform repo today (backend issue 4); the server's config can widen this. */
export const DEFAULT_ENVIRONMENTS = ["dev"];

/** Crypto-random request ID matching the request ID rule (spec §7), e.g. UI-7F3K9Q2M1A. */
export function newRequestId(prefix = "UI"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export function newDeleteTicketId() {
  return newRequestId("UI-DEL");
}

/** Strip characters the backend rejects in requester/approver names. */
export function sanitizePerson(name: string, fallback = "unknown") {
  const cleaned = name.replace(/[^A-Za-z0-9 ._@-]/g, "").trim().slice(0, 64).trim();
  return cleaned || fallback;
}

/** Best-effort conversion of free text (e.g. an assistant proposal's "name") into a valid project. */
export function toProjectName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}
