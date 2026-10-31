"""Saiam MCP server: exposes the same tenant-bound tools to any MCP client
(Claude Desktop, Cursor, other agents).

Run (stdio):   SAIAM_ORG_ID=org_acme SAIAM_USER_ROLE=CLIENT_ADMIN python -m app.mcp_layer.server
Identity comes from the launching process' environment, NOT from tool arguments, so a model
can never choose its own tenant. With no env set it runs as an anonymous VISITOR (public data only).
"""
from __future__ import annotations
import os
from mcp.server.fastmcp import FastMCP
from ..context import RequestContext, PUBLIC_ORG
from ..db import init_db
from ..tools.builtin import build_builtin_tools

init_db()
ctx = RequestContext(org_id=os.environ.get("SAIAM_ORG_ID", PUBLIC_ORG),
                     user_id=os.environ.get("SAIAM_USER_ID", "mcp-client"),
                     role=os.environ.get("SAIAM_USER_ROLE", "VISITOR"))
box = build_builtin_tools(ctx)
mcp = FastMCP("saiam-agency")


@mcp.tool()
def search_knowledge_base(query: str) -> str:
    """Search Saiam's services, FAQs, pricing, policies and (if authorised) the client's private project documents."""
    return box.call("search_knowledge_base", query=query)


@mcp.tool()
def get_project_status(title_keyword: str = "") -> str:
    """Live project, milestone and deliverable status for the authenticated organisation."""
    return box.call("get_project_status", title_keyword=title_keyword or None)


@mcp.tool()
def get_billing_summary(include_paid: bool = False) -> str:
    """Outstanding/overdue invoices for the authenticated organisation."""
    return box.call("get_billing_summary", include_paid=include_paid)


@mcp.tool()
def capture_lead(name: str, email: str, company: str = "", service_interest: str = "", message: str = "") -> str:
    """Register a sales lead for an account manager to follow up."""
    return box.call("capture_lead", name=name, email=email, company=company,
                    service_interest=service_interest, message=message)


@mcp.resource("saiam://services")
def services_resource() -> str:
    """The public services catalogue."""
    return box.call("search_knowledge_base", query="services offered")


if __name__ == "__main__":
    mcp.run()
