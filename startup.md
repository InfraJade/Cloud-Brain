# Startup Guide: CLOUD BRAIN

Two processes, run from the project root (`Service SD AI Soln`):

| Service | Port | URL |
|---|---|---|
| Backend (FastAPI proxy) | 8080 | http://localhost:8080/api/docs |
| Frontend (Vite) | 3000 | http://localhost:3000 |

There is no database or Redis. Everything lives on AWS.

**Prerequisites:** Python 3.11+ and Node.js 20+ with pnpm (`npm install -g pnpm`) for development, or
Docker Desktop for the deployed version.

---

## Deployed version (Docker)

Runs the production build: nginx serves the site on port **8088** and forwards `/api` to the backend container.
The backend reads `backend/.env` at start-up (configure it as in step 1 below; nothing secret goes into the images).

```powershell
cd "C:\Users\nikhil.rokade_jadegl\Desktop\Infra Automation Hub\Service SD AI Soln"

docker compose up -d --build     # build and start (first build takes a few minutes)
docker compose ps                # both services should say "healthy"
docker compose logs -f backend   # follow the backend log
docker compose down              # stop
```

- Open **http://localhost:8088**, or **http://&lt;this machine's IP&gt;:8088** from another computer on the network.
- After changing code or `backend/.env`, run `docker compose up -d --build` again.
- Use another port with `$env:CB_PORT=9000; docker compose up -d` (PowerShell).
- If other computers can't connect, allow the port through Windows Firewall (run PowerShell as administrator):
  `New-NetFirewallRule -DisplayName "Cloud Brain 8088" -Direction Inbound -Protocol TCP -LocalPort 8088 -Action Allow -Profile Domain,Private`

---

## 1. Configure the backend (first time only)

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env`:

- `CLOUD_BRAIN_USERS`: who can sign in, as `email:password:Full Name:role` entries separated by `;`.
  `role` is `admin` (can also delete resources) or `operator`.
- `JWT_SECRET_KEY`: any long random string.
- `CHATOPS_API_URL`: the base URL of the Cloud Brain API Gateway (`https://<api-id>.execute-api.us-east-1.amazonaws.com`).
  Ask the backend owner for it. It isn't stored in the repository.
- `CHATOPS_AWS_ACCESS_KEY_ID` / `CHATOPS_AWS_SECRET_ACCESS_KEY` (or `CHATOPS_AWS_ROLE_ARN`): read access to the
  `aws-ops-resources` DynamoDB table. Without these, the Resources page and request tracking don't work; chat,
  provisioning and deletion still do.

## 2. Start the application from the terminal

You need **two terminals** open at the same time: one for the backend and one for the frontend.
Start the backend first.

### Terminal 1: backend (PowerShell)

```powershell
cd "C:\Users\nikhil.rokade_jadegl\Desktop\Infra Automation Hub\Service SD AI Soln"

# First run only: create the virtual environment and install dependencies
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# Every run
.\.venv\Scripts\Activate.ps1
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080
```


### Terminal 2: frontend (PowerShell)

```powershell
cd "C:\Users\nikhil.rokade_jadegl\Desktop\Infra Automation Hub\Service SD AI Soln\frontend"

# First run only
pnpm install

# Every run
pnpm dev
```

When you see `Local: http://localhost:3000/`, open **http://localhost:3000** in your browser and sign in with a
user from `CLOUD_BRAIN_USERS`.

<details>
<summary>Same steps in Git Bash</summary>

```bash
# Terminal 1: backend
cd "/c/Users/nikhil.rokade_jadegl/Desktop/Infra Automation Hub/Service SD AI Soln"
python -m venv .venv                       # first run only
source .venv/Scripts/activate
pip install -r backend/requirements.txt    # first run only
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8080

# Terminal 2: frontend
cd "/c/Users/nikhil.rokade_jadegl/Desktop/Infra Automation Hub/Service SD AI Soln/frontend"
pnpm install                               # first run only
pnpm dev
```
</details>

### Stopping

Press **Ctrl + C** in each terminal.

If a later start fails with "port already in use", find what is holding the port and stop it:

```powershell
Get-NetTCPConnection -LocalPort 8080,3000 -State Listen | Select-Object LocalPort, OwningProcess
Stop-Process -Id <OwningProcess>
```

The backend must be started from the **project root**, not from inside `backend\`. Otherwise
`uvicorn backend.main:app` fails with "No module named 'backend'".

## 3. Sign in

Default accounts in `backend/.env.example`:

| Email | Password | Role |
|---|---|---|
| admin@jadeglobal.com | Admin@123 | admin |
| ops@jadeglobal.com | Ops@123 | operator |

These are only examples. The live `backend/.env` uses strong passwords: **change these before anyone else can reach
the app**, then restart (`docker compose up -d --force-recreate backend`, or restart uvicorn).

## 4. "Sample data" banners

Until the backend owner deploys `GET /inventory` and the `/cost/*` endpoints on AWS, the Dashboard and Costs pages
show the example numbers from the backend spec under a **Sample data** banner. They switch to real figures on their
own once the endpoints are deployed. *Settings → Test connection* shows which endpoints are live.

---

## Useful commands

```bash
# Backend tests (AWS is stubbed, so nothing real is provisioned)
cd backend && ../.venv/Scripts/python -m pytest -q

# Frontend typecheck + production build (output: frontend/dist)
cd frontend && pnpm build
```

