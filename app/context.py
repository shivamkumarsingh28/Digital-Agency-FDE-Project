"""Verified request identity + role capabilities.

The gateway (Next.js) authenticates the user and forwards X-Tenant-ID / X-User-ID /
X-User-Role. This service treats them as immutable execution parameters.
"""
from __future__ import annotations
from dataclasses import dataclass, field

PUBLIC_ORG = "public"

CAPABILITIES: dict[str, set[str]] = {
    "VISITOR":         {"faq", "lead"},
    "CLIENT_REVIEWER": {"faq", "project", "lead"},
    "CLIENT_ADMIN":    {"faq", "project", "billing", "lead", "integrations"},
    "SPECIALIST":      {"faq", "project"},
    "ACCOUNT_MANAGER": {"faq", "project", "billing", "lead", "integrations"},
    "SYSTEM_ADMIN":    {"faq", "project", "billing", "lead", "integrations", "ingest"},
}


@dataclass
class RequestContext:
    org_id: str = PUBLIC_ORG
    user_id: str = "anonymous"
    role: str = "VISITOR"
    sources: list = field(default_factory=list)   # filled by the RAG tool during a turn

    def __post_init__(self):
        if self.role not in CAPABILITIES:
            self.role = "VISITOR"
        if self.org_id == PUBLIC_ORG:          # fail closed: no tenant => visitor
            self.role = "VISITOR"

    @property
    def authenticated(self) -> bool:
        return self.org_id != PUBLIC_ORG and self.role != "VISITOR"

    def can(self, capability: str) -> bool:
        return capability in CAPABILITIES.get(self.role, set())
