from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = str(Path(__file__).resolve().parent.parent.parent / ".env")


class Settings(BaseSettings):
    # ── Auth ────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "cloud-brain-default-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    # Users allowed to sign in, as "email:password:Full Name:role" entries separated by ";".
    # role is "admin" (can also de-provision) or "operator" (default). Example:
    #   CLOUD_BRAIN_USERS=admin@jadeglobal.com:Admin@123:Platform Admin:admin;ops@jadeglobal.com:Ops@123:Cloud Operator:operator
    CLOUD_BRAIN_USERS: str = ""

    # Comma-separated browser origins allowed by CORS.
    FRONTEND_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── AWS Cloud Brain API (API Gateway) — base URL comes from backend/.env ──
    CHATOPS_API_URL: str = ""                    # e.g. https://<api-id>.execute-api.<region>.amazonaws.com
    # Step Functions routes (asynchronous: they return an execution receipt, not a result).
    CHATOPS_PROVISION_PATH: str = "/provision"   # POST   — request an EC2 instance / S3 bucket
    CHATOPS_DELETE_PATH: str = "/resource"       # DELETE — request deletion
    # Lambda routes.
    CHATOPS_AGENT_PATH: str = "/agent"           # POST   — AI assistant
    CHATOPS_AGENT_API_URL: str = ""              # base URL of the agent API; blank = reuse CHATOPS_API_URL
    CHATOPS_INVENTORY_PATH: str = "/inventory"           # GET  — service counts
    CHATOPS_COST_CURRENT_PATH: str = "/cost/current"     # GET  — month-to-date spend
    CHATOPS_COST_FORECAST_PATH: str = "/cost/forecast"   # GET  — projected month end
    CHATOPS_COST_REPORT_PATH: str = "/cost/report"       # POST — any date range + CSV/HTML downloads
    CHATOPS_API_KEY: str = ""                    # optional; sent as x-api-key header if set
    CHATOPS_REQUEST_TIMEOUT: int = 25            # seconds, Step Functions routes
    CHATOPS_AGENT_TIMEOUT: int = 35              # seconds; the agent takes 5–25 s (API Gateway cuts at 30 s)
    CHATOPS_INSIGHTS_TIMEOUT: int = 35           # seconds; /inventory?regions=all can take 5–15 s

    # Environments the UI may provision into. The workflow accepts dev, qa and stage, but
    # only dev exists in the Terraform repo today (backend issue 4), so offer only dev.
    CHATOPS_ALLOWED_ENVS: str = "dev"

    # Resource registry: DynamoDB read access for the resource list and request status.
    # (The API's own GET /status is a Step Functions route that can't return data.)
    # Static keys take precedence over the role.
    AWS_REGION: str = "us-east-1"
    CHATOPS_AWS_ACCESS_KEY_ID: str = ""      # static IAM user key for direct DynamoDB reads
    CHATOPS_AWS_SECRET_ACCESS_KEY: str = ""  # pairs with the key above
    CHATOPS_AWS_ROLE_ARN: str = ""          # role to assume for DynamoDB reads; blank disables role mode
    CHATOPS_AWS_ROLE_SESSION_NAME: str = "cloud-brain-reader"
    CHATOPS_AWS_EXTERNAL_ID: str = ""        # optional — only if the role's trust policy requires one
    CHATOPS_AWS_PROFILE: str = ""            # optional named profile holding the BASE credentials that assume the role
    CHATOPS_DYNAMODB_TABLE: str = "aws-ops-resources"           # partition key: resource_id
    CHATOPS_DYNAMODB_REQUEST_INDEX: str = "request_id-index"    # secondary index on request_id

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    @property
    def allowed_envs(self) -> list[str]:
        envs = [e.strip().lower() for e in self.CHATOPS_ALLOWED_ENVS.split(",") if e.strip()]
        return envs or ["dev"]

    @property
    def direct_read_configured(self) -> bool:
        return bool(
            (self.CHATOPS_AWS_ACCESS_KEY_ID and self.CHATOPS_AWS_SECRET_ACCESS_KEY)
            or self.CHATOPS_AWS_ROLE_ARN
        )


settings = Settings()
