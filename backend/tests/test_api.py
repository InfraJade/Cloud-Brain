"""API tests for the CLOUD BRAIN proxy. AWS is never called — upstream calls are stubbed."""

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.core.rate_limit import limiter
from backend.app.services.chatops import aws_dynamodb, chatops_service
from backend.main import app

USERS = "admin@test.com:pw-admin:Ada Admin:admin;ops@test.com:pw-ops:Otto Ops (QA)"

PROVISION = {"project": "billing", "resource_type": "ec2", "request_id": "UI-7F3K9Q2M1A", "instance_type": "t3.small", "os_name": "ubuntu"}


@pytest.fixture(autouse=True)
def _config(monkeypatch):
    monkeypatch.setattr(settings, "CLOUD_BRAIN_USERS", USERS)
    monkeypatch.setattr(settings, "CHATOPS_AWS_ACCESS_KEY_ID", "AKIA-test")
    monkeypatch.setattr(settings, "CHATOPS_AWS_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setattr(settings, "CHATOPS_AWS_ROLE_ARN", "")
    monkeypatch.setattr(settings, "CHATOPS_ALLOWED_ENVS", "dev")
    limiter.reset()


class FakeResponse:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


@pytest.fixture
def upstream(monkeypatch):
    """Record HTTP calls to AWS; answer from `upstream.replies` keyed by path (default: receipt)."""

    class Recorder:
        calls: list = []
        replies: dict = {}

    rec = Recorder()
    rec.calls = []
    rec.replies = {}

    class FakeClient:
        async def request(self, method, url, json=None, params=None, headers=None, timeout=None):
            path = url.split(".amazonaws.com", 1)[-1]
            rec.calls.append({"method": method, "path": path, "body": json, "params": params, "timeout": timeout})
            reply = rec.replies.get(path)
            if isinstance(reply, Exception):
                raise reply
            if reply is None:
                reply = (200, {"executionArn": "arn:aws:states:exec/1", "startDate": 1.0})
            return FakeResponse(*reply)

    fake = FakeClient()
    monkeypatch.setattr(chatops_service, "_client", lambda: fake)
    return rec


client = TestClient(app)


def login(email="ops@test.com", password="pw-ops"):
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def admin():
    return login("admin@test.com", "pw-admin")


# ── auth ─────────────────────────────────────────────────────────────────────


def test_healthz():
    assert client.get("/api/healthz").json()["status"] == "ok"


def test_login_success_returns_user_and_default_role():
    res = client.post("/api/v1/auth/login", json={"email": "OPS@test.com", "password": "pw-ops"})
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "operator"


def test_login_wrong_password():
    assert client.post("/api/v1/auth/login", json={"email": "ops@test.com", "password": "x"}).status_code == 401


def test_login_without_configured_users(monkeypatch):
    monkeypatch.setattr(settings, "CLOUD_BRAIN_USERS", "")
    assert client.post("/api/v1/auth/login", json={"email": "ops@test.com", "password": "pw-ops"}).status_code == 503


def test_removed_user_is_revoked(monkeypatch):
    headers = login()
    monkeypatch.setattr(settings, "CLOUD_BRAIN_USERS", "admin@test.com:pw-admin:Ada Admin:admin")
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_routes_require_auth():
    assert client.get("/api/v1/chatops/resources").status_code == 401
    assert client.get("/api/v1/cloud/inventory").status_code == 401


# ── provision (§4.5, §7) ─────────────────────────────────────────────────────


def test_config_lists_only_allowed_envs_and_approved_types():
    body = client.get("/api/v1/chatops/config", headers=login()).json()
    assert body["environments"] == ["dev"]
    assert len(body["instance_types"]) == 12 and "m5.xlarge" in body["instance_types"]


def test_provision_sends_spec_body_with_ui_request_id(upstream):
    res = client.post("/api/v1/chatops/provision", headers=login(), json=PROVISION)
    assert res.status_code == 200, res.text
    assert res.json()["request_id"] == "UI-7F3K9Q2M1A"
    sent = upstream.calls[0]
    assert sent["method"] == "POST" and sent["path"] == "/provision"
    assert sent["body"] == {
        "project": "billing", "env": "dev", "resource_type": "ec2", "request_id": "UI-7F3K9Q2M1A",
        "requester_name": "Otto Ops QA", "approver_name": "Authorized Platform Admin",
        "instance_type": "t3.small", "os_name": "ubuntu", "httpMethod": "POST",
    }


@pytest.mark.parametrize(
    "override, fragment",
    [
        ({"project": "ab"}, "Project must be"),
        ({"project": "Billing"}, "Project must be"),
        ({"project": "-billing"}, "Project must be"),
        ({"project": "a" * 31}, "Project must be"),
        ({"instance_type": "c5.large"}, "approved types"),
        ({"os_name": "debian"}, "Operating system"),
        ({"env": "qa"}, "Environment must be one of: dev"),
        ({"request_id": "no spaces allowed"}, "Request ID"),
        ({"resource_type": "rds"}, "Resource type"),
    ],
)
def test_provision_rejects_invalid_fields_before_calling_aws(upstream, override, fragment):
    res = client.post("/api/v1/chatops/provision", headers=login(), json={**PROVISION, **override})
    assert res.status_code == 400
    assert fragment in res.json()["detail"]
    assert upstream.calls == []


def test_provision_project_length_bounds(upstream):
    assert client.post("/api/v1/chatops/provision", headers=login(), json={**PROVISION, "project": "abc"}).status_code == 200
    assert client.post("/api/v1/chatops/provision", headers=login(), json={**PROVISION, "project": "a" * 30}).status_code == 200


def test_s3_provision_omits_ec2_fields(upstream):
    client.post("/api/v1/chatops/provision", headers=login(), json={**PROVISION, "resource_type": "s3"})
    assert "instance_type" not in upstream.calls[0]["body"]


def test_allowed_envs_are_configurable(upstream, monkeypatch):
    monkeypatch.setattr(settings, "CHATOPS_ALLOWED_ENVS", "dev,qa")
    assert client.post("/api/v1/chatops/provision", headers=login(), json={**PROVISION, "env": "qa"}).status_code == 200


def test_provision_requires_request_id(upstream):
    body = {k: v for k, v in PROVISION.items() if k != "request_id"}
    assert client.post("/api/v1/chatops/provision", headers=login(), json=body).status_code == 422


# ── delete (§4.7) ────────────────────────────────────────────────────────────


def test_delete_is_admin_only(upstream):
    payload = {"resource_id": "jade-dev-7", "delete_ticket_id": "UI-DEL-4Q8W2Z"}
    assert client.request("DELETE", "/api/v1/chatops/resources", headers=login(), json=payload).status_code == 403
    assert upstream.calls == []


def test_delete_prefers_resource_id(upstream):
    payload = {"resource_id": "jade-dev-7", "request_id": "UI-7F3K9Q2M1A", "delete_ticket_id": "UI-DEL-4Q8W2Z", "resource_type": "s3"}
    res = client.request("DELETE", "/api/v1/chatops/resources", headers=admin(), json=payload)
    assert res.status_code == 200, res.text
    assert upstream.calls[0]["body"] == {
        "delete_ticket_id": "UI-DEL-4Q8W2Z", "resource_id": "jade-dev-7", "resource_type": "s3", "httpMethod": "DELETE",
    }


def test_delete_by_request_id_when_no_resource_id(upstream):
    payload = {"request_id": "UI-7F3K9Q2M1A", "delete_ticket_id": "UI-DEL-4Q8W2Z"}
    client.request("DELETE", "/api/v1/chatops/resources", headers=admin(), json=payload)
    assert upstream.calls[0]["body"]["request_id"] == "UI-7F3K9Q2M1A"
    assert "resource_id" not in upstream.calls[0]["body"]


def test_delete_needs_a_target(upstream):
    res = client.request("DELETE", "/api/v1/chatops/resources", headers=admin(), json={"delete_ticket_id": "UI-DEL-1"})
    assert res.status_code == 400


# ── registry reads ───────────────────────────────────────────────────────────


def test_status_by_request_uses_registry(monkeypatch):
    seen = {}

    async def by_request(request_id):
        seen["request_id"] = request_id
        return [{"resource_id": "jade-dev-7", "request_id": request_id, "status": "ACTIVE"}]

    monkeypatch.setattr(aws_dynamodb, "fetch_by_request", by_request)
    body = client.get("/api/v1/chatops/status?request_id=UI-7F3K9Q2M1A", headers=login()).json()
    assert seen["request_id"] == "UI-7F3K9Q2M1A"
    assert body["found"] is True and body["resources"][0]["status"] == "ACTIVE"


def test_status_by_resource(monkeypatch):
    async def by_resource(resource_id):
        return []

    monkeypatch.setattr(aws_dynamodb, "fetch_by_resource", by_resource)
    body = client.get("/api/v1/chatops/status?resource_id=jade-dev-7", headers=login()).json()
    assert body["found"] is False and body["resources"] == []


def test_status_validation_and_no_read_access(monkeypatch):
    headers = login()
    assert client.get("/api/v1/chatops/status", headers=headers).status_code == 400
    assert client.get("/api/v1/chatops/status?request_id=a b", headers=headers).status_code == 400
    monkeypatch.setattr(settings, "CHATOPS_AWS_ACCESS_KEY_ID", "")
    assert client.get("/api/v1/chatops/status?request_id=UI-1234", headers=headers).status_code == 503


def test_list_resources(monkeypatch):
    async def scan():
        return [{"resource_id": "jade-dev-7", "request_id": "UI-1", "status": "ACTIVE"}]

    monkeypatch.setattr(aws_dynamodb, "fetch_resources", scan)
    body = client.get("/api/v1/chatops/resources", headers=login()).json()
    assert body["source"] == "dynamodb" and len(body["resources"]) == 1


def test_list_without_read_access(monkeypatch):
    monkeypatch.setattr(settings, "CHATOPS_AWS_ACCESS_KEY_ID", "")
    body = client.get("/api/v1/chatops/resources", headers=login()).json()
    assert body["source"] == "unavailable" and body["resources"] == []


# ── insights pass-through (§4.1–4.4) ─────────────────────────────────────────


def test_inventory_passes_query_params_through(upstream):
    upstream.replies["/inventory"] = (200, {"services": [], "generated_at": "2026-10-14T09:30:12Z"})
    res = client.get("/api/v1/cloud/inventory?regions=all", headers=login())
    assert res.status_code == 200
    assert upstream.calls[0]["params"] == {"regions": "all"}
    assert upstream.calls[0]["body"] is None  # no httpMethod on Lambda routes


def test_cost_route_not_deployed_maps_to_404_flag(upstream):
    upstream.replies["/cost/current"] = (404, {"message": "Not Found"})
    res = client.get("/api/v1/cloud/cost/current?group_by=service", headers=login())
    assert res.status_code == 404
    assert res.json()["detail"]["not_deployed"] is True


def test_cost_400_message_is_passed_through(upstream):
    upstream.replies["/cost/forecast"] = (400, {"error": "group_by is not supported for a forecast."})
    res = client.get("/api/v1/cloud/cost/forecast?group_by=service", headers=login())
    assert res.status_code == 400
    assert res.json()["detail"]["message"] == "group_by is not supported for a forecast."


def test_report_posts_body(upstream):
    upstream.replies["/cost/report"] = (200, {"action": "report", "total": 1.0})
    res = client.post("/api/v1/cloud/cost/report", headers=login(), json={"period": "last_month", "group_by": "service"})
    assert res.status_code == 200
    assert upstream.calls[0]["body"] == {"period": "last_month", "group_by": "service"}


def test_upstream_401_never_reaches_the_browser_as_401(upstream):
    upstream.replies["/inventory"] = (401, {"message": "Unauthorized"})
    assert client.get("/api/v1/cloud/inventory", headers=login()).status_code == 403


def test_upstream_timeout_is_504(upstream):
    upstream.replies["/inventory"] = httpx.ReadTimeout("slow")
    assert client.get("/api/v1/cloud/inventory", headers=login()).status_code == 504


# ── agent (§4.8) ─────────────────────────────────────────────────────────────


def test_agent_first_message_omits_session_id(upstream):
    upstream.replies["/agent"] = (200, {"reply": "hi", "session_id": "3f1c9a52", "actions": []})
    body = client.post("/api/v1/chatops/agent", headers=login(), json={"message": "hello"}).json()
    assert body["session_id"] == "3f1c9a52"
    assert upstream.calls[0]["body"] == {"message": "hello"}
    assert upstream.calls[0]["timeout"] == settings.CHATOPS_AGENT_TIMEOUT


def test_agent_passes_session_and_decision(upstream):
    upstream.replies["/agent"] = (200, {"reply": "Submitted", "session_id": "s1", "tracking": {"request_id": "req-1", "state": "in_progress"}})
    client.post("/api/v1/chatops/agent", headers=login(), json={"session_id": "s1", "action_id": "req-1", "decision": "confirm"})
    assert upstream.calls[0]["body"] == {"session_id": "s1", "action_id": "req-1", "decision": "confirm"}


@pytest.mark.parametrize("status, error", [(404, "Action not found"), (409, "Already handled"), (410, "This request expired. Ask me again."), (502, "Could not start the workflow")])
def test_agent_decision_errors_pass_through(upstream, status, error):
    upstream.replies["/agent"] = (status, {"error": error})
    res = client.post("/api/v1/chatops/agent", headers=login(), json={"session_id": "s1", "action_id": "req-1", "decision": "confirm"})
    assert res.status_code == status
    assert res.json()["detail"]["message"] == error


def test_agent_rejects_bad_decision(upstream):
    res = client.post("/api/v1/chatops/agent", headers=login(), json={"action_id": "a1", "decision": "maybe"})
    assert res.status_code == 400
    assert upstream.calls == []
