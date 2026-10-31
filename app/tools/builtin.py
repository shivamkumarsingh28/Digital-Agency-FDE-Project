"""Built-in tools. Tenant identity is captured by closure from the verified context -
the LLM can never supply or override `organization_id`."""
from __future__ import annotations
import json
import re
import urllib.request
import uuid
from .registry import Tool, ToolBox
from ..context import RequestContext
from ..config import get_settings
from ..db import connect
from ..rag import retriever

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or []}


def build_builtin_tools(ctx: RequestContext) -> ToolBox:
    box = ToolBox(ctx)
    settings = get_settings()

    # ---------------- RAG ----------------
    def search_knowledge_base(query: str) -> str:
        hits = retriever.search(ctx.org_id, query)
        if not hits:
            return "NO_RESULTS: nothing relevant found in the knowledge base."
        lines = []
        for i, h in enumerate(hits, 1):
            ref = {"n": len(ctx.sources) + 1, "title": h["title"], "heading": h["heading"],
                   "scope": h["scope"], "score": h["score"], "excerpt": h["content"][:240], "text": h["content"]}
            ctx.sources.append(ref)
            lines.append(f"[{i}] ({h['scope']}) {h['content']}")
        return "\n\n".join(lines)

    box.add(Tool("search_knowledge_base",
                 "Semantic search over Saiam's services, FAQs, pricing, policies, SLAs and the caller's own "
                 "project documents. Use for any question about what Saiam offers or how it works.",
                 _obj({"query": {"type": "string", "description": "Self-contained search query."}}, ["query"]),
                 search_knowledge_base, "faq"))

    # ---------------- Project status (read-only, parameterised) ----------------
    def get_project_status(title_keyword: str | None = None) -> str:
        sql = ("SELECT id, title, status, budget, end_date FROM projects WHERE organization_id = ?")
        params: list = [ctx.org_id]
        if title_keyword:
            sql += " AND (title LIKE ? OR id IN (SELECT project_id FROM deliverables WHERE title LIKE ?))"
            params += [f"%{title_keyword}%"] * 2
        sql += " ORDER BY updated_at DESC LIMIT 5"
        with connect(readonly=True) as c:
            projects = c.execute(sql, params).fetchall()
            if not projects:
                return "No matching projects found for your organization."
            out = []
            for p in projects:
                dels = c.execute("SELECT title, status, version, due_date FROM deliverables "
                                 "WHERE project_id = ? ORDER BY due_date", (p["id"],)).fetchall()
                head = f"- Project: {p['title']} | Status: {p['status']} | Target delivery: {p['end_date']}"
                items = "\n".join(f"    * {d['title']} (v{d['version']}) - {d['status']}, due {d['due_date']}" for d in dels)
                out.append(head + ("\n" + items if items else ""))
            return "\n".join(out)

    box.add(Tool("get_project_status",
                 "Get live status, milestone dates and deliverable review states for the caller's projects.",
                 _obj({"title_keyword": {"type": "string", "description": "Optional project/deliverable title fragment."}}),
                 get_project_status, "project"))

    # ---------------- Billing ----------------
    def get_billing_summary(include_paid: bool = False) -> str:
        sql = ("SELECT i.id, i.amount, i.status, i.due_date, p.title AS project FROM invoices i "
               "LEFT JOIN projects p ON p.id = i.project_id WHERE i.organization_id = ?")
        if not include_paid:
            sql += " AND i.status IN ('UNPAID','OVERDUE')"
        sql += " ORDER BY i.due_date LIMIT 10"
        with connect(readonly=True) as c:
            rows = c.execute(sql, (ctx.org_id,)).fetchall()
        if not rows:
            return "Your account is clear: no outstanding or overdue invoices."
        total = sum(r["amount"] for r in rows if r["status"] in ("UNPAID", "OVERDUE"))
        lines = [f"- {r['id']} | {r['project']} | ${r['amount']:,.2f} | {r['status']} | due {r['due_date']}" for r in rows]
        return "\n".join(lines) + f"\nOutstanding total: ${total:,.2f}"

    box.add(Tool("get_billing_summary",
                 "List outstanding/overdue invoices (and optionally paid history) for the caller's organization.",
                 _obj({"include_paid": {"type": "boolean", "description": "True only if the user asks for paid history."}}),
                 get_billing_summary, "billing"))

    def create_payment_link(invoice_id: str) -> str:
        with connect(readonly=True) as c:
            r = c.execute("SELECT id, amount, status FROM invoices WHERE id = ? AND organization_id = ?",
                          (invoice_id, ctx.org_id)).fetchone()
        if not r:
            return f"Invoice {invoice_id} was not found for your organization."
        if r["status"] == "PAID":
            return f"Invoice {invoice_id} is already paid."
        # Replace with stripe.checkout.Session.create(...) in production.
        return f"Secure payment link for {invoice_id} (${r['amount']:,.2f}): {settings.payment_link_base}/{invoice_id}"

    box.add(Tool("create_payment_link", "Generate a secure checkout link for one unpaid invoice of the caller.",
                 _obj({"invoice_id": {"type": "string", "description": "Invoice id such as INV-1002."}}, ["invoice_id"]),
                 create_payment_link, "billing"))

    # ---------------- Lead intake + escalation ----------------
    def _notify(text: str) -> None:
        if not settings.escalation_webhook:
            return
        try:
            req = urllib.request.Request(settings.escalation_webhook, json.dumps({"text": text}).encode(),
                                         {"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass

    def capture_lead(name: str, email: str, company: str = "", phone: str = "",
                     service_interest: str = "", message: str = "") -> str:
        if not name.strip() or not EMAIL_RE.match(email.strip()):
            return "Error: a name and a valid email address are required to register a lead."
        lid = "LEAD-" + uuid.uuid4().hex[:6].upper()
        with connect() as c:
            c.execute("INSERT INTO leads(id,name,email,phone,company,service_interest,message,organization_id,user_id)"
                      " VALUES (?,?,?,?,?,?,?,?,?)",
                      (lid, name.strip(), email.strip(), phone, company, service_interest, message[:1000],
                       ctx.org_id, ctx.user_id))
        _notify(f"New lead {lid}: {name} <{email}> {company} - {service_interest}")
        return f"Lead registered with reference {lid}. An account manager will reply within one business day."

    box.add(Tool("capture_lead", "Register a prospect so an account manager can follow up. Needs name and email.",
                 _obj({"name": {"type": "string"}, "email": {"type": "string"}, "company": {"type": "string"},
                       "phone": {"type": "string"}, "service_interest": {"type": "string"},
                       "message": {"type": "string", "description": "Short summary of what they need."}},
                      ["name", "email"]),
                 capture_lead, "lead"))

    def create_escalation(summary: str, priority: str = "normal") -> str:
        priority = priority if priority in {"low", "normal", "high", "urgent"} else "normal"
        eid = "ESC-" + uuid.uuid4().hex[:6].upper()
        with connect() as c:
            c.execute("INSERT INTO escalations(id,organization_id,user_id,priority,summary) VALUES (?,?,?,?,?)",
                      (eid, ctx.org_id, ctx.user_id, priority, summary[:1000]))
        _notify(f"[{priority.upper()}] Escalation {eid} from {ctx.org_id}/{ctx.user_id}: {summary}")
        return f"Escalation {eid} created with priority {priority}. Your account manager has been alerted."

    box.add(Tool("create_escalation", "Escalate an urgent or unresolved issue to a human account manager.",
                 _obj({"summary": {"type": "string"},
                       "priority": {"type": "string", "enum": ["low", "normal", "high", "urgent"]}}, ["summary"]),
                 create_escalation, "lead"))
    return box
