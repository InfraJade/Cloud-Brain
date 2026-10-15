# CLOUD BRAIN

*One Brain. Every Cloud.* A web app for the Cloud Brain platform: request and track EC2 instances and S3 buckets,
see what's running and what it costs, and ask an AI assistant about your AWS account.

The frontend follows the backend team's spec, **Cloud Brain Backend API** (`docs/BACKEND-API.md` in the cloud-brain
repository).

| Page | Route | What it does | AWS endpoints |
|---|---|---|---|
| Dashboard | `/` | The spec's landing page: month-to-date, forecast and last-month cost; seven service tiles with a region selector; daily spend; top services; "Generate cost report" | `GET /inventory`, `GET /cost/current`, `GET /cost/forecast` |
| Provision | `/provision` | EC2 / S3 request form, validated exactly as the spec's §7 rules | `POST /provision` |
| Requests | `/requests`, `/requests/:id` | Request tracker: pending → ACTIVE, every 15 s for up to 20 min, with delete | registry lookup, `DELETE /resource` |
| Resources | `/resources` | Everything the platform created (the `aws-ops-resources` registry), with details and delete | registry, `DELETE /resource` |
| Costs | `/costs` | Month-to-date breakdown with a group-by switcher and filters, forecast, report builder with CSV / HTML downloads | `GET /cost/*`, `POST /cost/report` |
| Assistant | `/assistant` + floating widget | Chat with the AI assistant; proposals are confirmed, cancelled or sent to the form | `POST /agent` |
| Settings | `/settings` | Theme, assistant, provisioning defaults, auto-refresh, AWS connection test | — |

## How it fits together

```
Browser (frontend/, React + Vite)
   │  /api/*  (signed-in users only)
   ▼
CLOUD BRAIN backend (backend/, FastAPI proxy; holds the AWS secrets)
   ├─► AWS API Gateway (URL set in backend/.env)
   │      /provision · /resource ──► Step Functions → Lambda → GitHub (Terraform) → CodeBuild
   │      /agent ──────────────────► AI assistant (Claude on Bedrock)
   │      /inventory · /cost/* ────► Inventory and Cost Lambdas
   └─► DynamoDB "aws-ops-resources" (resource registry; request status)
```

- The browser never calls AWS itself: API Gateway has no CORS configured, and the AWS read credentials must stay
  on the server.
- Provisioning and deletion are **asynchronous**. The API accepts the request, and the resource appears or
  disappears minutes later, so the UI tracks every request.
- Request status is read from the registry directly, because the API's own `GET /status` can't return data yet.
- Endpoints that aren't deployed yet (`/inventory`, `/cost/*` at the time of writing) show the spec's example data
  under a **Sample data** banner, and switch to real data on their own once deployed.

## Repository layout

| Path | What |
|---|---|
| `frontend/` | CLOUD BRAIN web app (React 19, Vite, Tailwind v4, Radix UI, TanStack Query) |
| `backend/` | FastAPI proxy: login, provisioning / registry / assistant routes, inventory and cost pass-through |
| `AWS/` | Reference copy of the AWS side (Terraform, Lambdas, Step Function, agent package) |
| `docs/` | AWS ChatOps with Terraform design doc |

See **[startup.md](startup.md)** to run it locally.

> The previous STACK Service Desk application is preserved on the `stack-archive` git branch.
