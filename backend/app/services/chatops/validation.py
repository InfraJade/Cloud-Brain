"""Provisioning field rules — a mirror of the backend's own checks (BACKEND-API.md §7).

POST /provision is asynchronous: AWS returns 200 as soon as the request is accepted and
validation failures only surface later, as a Slack message to the platform team. So
every field is checked here, before anything is sent.
"""

import re

PROJECT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")
REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{3,64}$")
PERSON_RE = re.compile(r"^[A-Za-z0-9 ._@-]{1,64}$")
RESOURCE_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

RESOURCE_TYPES = ("ec2", "s3")
INSTANCE_TYPES = (
    "t2.micro", "t2.small", "t2.medium",
    "t3.micro", "t3.small", "t3.medium", "t3.large",
    "t3a.micro", "t3a.small", "t3a.medium",
    "m5.large", "m5.xlarge",
)
OS_OPTIONS = ("ubuntu", "windows", "amazonlinux23")
DEFAULT_APPROVER = "Authorized Platform Admin"


def sanitize_person(name: str | None, fallback: str = "unknown") -> str:
    """Strip characters the backend rejects (allowed: letters, digits, space, . _ @ -)."""
    cleaned = re.sub(r"[^A-Za-z0-9 ._@-]", "", name or "").strip()[:64].strip()
    return cleaned or fallback
