"""Deterministic specialist behaviours used when no LLM API key is configured.
They exercise the *real* tools, so RAG, tenant isolation, RBAC and audit all behave identically."""
from __future__ import annotations
import re
from ..rag.embeddings import tokenize

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
URGENT = re.compile(r"urgent|asap|emergency|critical|outage|\bdown\b|broken|not working|can'?t access|blocked", re.I)
SERVICES = ["brand", "logo", "website", "e-commerce", "ecommerce", "seo", "video", "paid media", "social", "ai", "chatbot", "retainer"]
KEYWORDS = ["logo", "brand", "website", "web", "seo", "packaging", "video", "app", "checkout", "homepage", "product", "guidelines", "campaign"]


def route_keywords(msg: str, has_integrations: bool) -> tuple[str, str]:
    m = msg.lower()
    if EMAIL.search(msg) or re.search(r"quote|proposal|hire you|get started|talk to|speak to|human|account manager|"
                                      r"contact me|call me|book a (call|meeting)|escalat|urgent|emergency|outage|not working", m):
        return "escalation_specialist", "contact / lead / urgent-issue intent"
    if re.search(r"invoice|billing|bill\b|payment|pay\b|balance|overdue|retainer balance|receipt|owe|checkout link", m):
        return "billing_specialist", "billing intent"
    if re.search(r"project|deliverable|milestone|status|deadline|when will|progress|approval|approve|revision (status|request)|"
                 r"due date", m):
        return "project_specialist", "project-status intent"
    if has_integrations and re.search(r"calendar|schedule|slack|crm|fetch|browse|file", m):
        return "integrations_specialist", "external integration intent"
    if re.fullmatch(r"\W*(hi|hello|hey|thanks|thank you|ok|okay|good (morning|afternoon|evening)|bye)\W*", m):
        return "respond_direct", "small talk"
    return "faq_specialist", "default: knowledge question"


def _parse_hits(out: str) -> list[tuple[str, str]]:
    hits = []
    for part in re.split(r"\n\n(?=\[\d+\] \()", out):
        m = re.match(r"^\[\d+\] \((\w+)\) \[(.*?)\]\n(.*)$", part, re.S)
        if m:
            hits.append((m.group(2), m.group(3).strip()))
    return hits


def _best_sentences(body: str, query: str, n: int = 3) -> str:
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", body) if s.strip()]
    q = set(tokenize(query))
    scored = sorted(range(len(sents)), key=lambda i: -len(q & set(tokenize(sents[i]))))[:n]
    return " ".join(sents[i] for i in sorted(scored))


def faq(box, msg: str, history) -> str:
    out = box.call("search_knowledge_base", query=msg)
    hits = _parse_hits(out)
    if not hits:
        return ""
    title, body = hits[0]
    ans = _best_sentences(body, msg)
    extra = [t.split(" > ")[-1] for t, _ in hits[1:3] if t != title]
    if extra:
        ans += "\n\nRelated topics I can explain: " + ", ".join(dict.fromkeys(extra)) + "."
    return ans


def project(box, msg: str, history) -> str:
    kw = next((k for k in KEYWORDS if k in msg.lower()), None)
    out = box.call("get_project_status", title_keyword=kw) if kw else ""
    if not out or out.startswith("No matching"):
        out = box.call("get_project_status")
    pending = out.count("PENDING_CLIENT_APPROVAL")
    tail = f"\n\n{pending} deliverable(s) are waiting for your approval in the portal." if pending else ""
    return "Here is the latest on your projects:\n" + out + tail


def billing(box, msg: str, history) -> str:
    hist = bool(re.search(r"paid|history|receipt|past", msg, re.I))
    out = box.call("get_billing_summary", include_paid=hist)
    if re.search(r"link|pay now|pay (it|this|my)|checkout|how (do|can) i pay|\bpay\b", msg, re.I) and not hist:
        inv = re.search(r"INV-\d+", msg) or re.search(r"INV-\d+", out)
        if inv:
            out += "\n\n" + box.call("create_payment_link", invoice_id=inv.group(0))
    return "Here is your billing summary:\n" + out


def escalation(box, msg: str, history) -> str:
    users = " ".join(h["content"] for h in history[-6:] if h["role"] == "user") + " " + msg
    email = EMAIL.search(users)
    nm = re.search(r"(?:my name is|i am|i'm|this is|name:)\s+([A-Za-z]+(?:\s[A-Z][a-z]+)?)", users, re.I)
    co = re.search(r"(?:from|at|company is|work for|company:)\s+([A-Z][\w&.\-]*(?:\s[A-Z][\w&.\-]*){0,3})", users)
    svc = next((s for s in SERVICES if s in users.lower()), "")
    if URGENT.search(msg) and box.ctx.authenticated:
        return box.call("create_escalation", summary=msg, priority="urgent")
    if email and nm:
        return box.call("capture_lead", name=nm.group(1).title(), email=email.group(0),
                        company=co.group(1) if co else "", service_interest=svc, message=users[:500])
    return ("Happy to connect you with an account manager. Could you share your name, email address, and a line "
            "about what you need? (For example: \"My name is Priya, priya@brand.com, we need a new website.\")")


def integrations(box, msg: str, history, tool_names) -> str:
    return ("These integrations are connected: " + ", ".join(tool_names) +
            ". Tell me which one to use and what you need.")


def direct(msg: str) -> str:
    if re.search(r"thank|bye", msg, re.I):
        return "You're welcome! Ask me anything else about Saiam anytime."
    return ("Hi, I'm Saiam Assistant. I can explain our services and pricing, check project and invoice status "
            "(after sign-in), or connect you with an account manager. What would you like to know?")
