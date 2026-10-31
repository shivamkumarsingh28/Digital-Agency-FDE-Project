"""FastAPI entrypoint.

Production endpoint   POST /api/v1/chat/stream   (called by the Next.js gateway with X-Tenant-ID,
                                                  X-User-ID, X-User-Role, X-Internal-Secret)
Demo endpoint         POST /api/v1/demo/chat/stream  (DEMO_MODE=1 only; server-side personas)
Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations
import hmac
import json
import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from . import memory
from .config import ROOT, get_settings
from .context import PUBLIC_ORG, RequestContext
from .db import init_db
from .rag.embeddings import get_embedder
from .rag.ingest import ingest_all, ingest_text
from .rag.retriever import store
from .service import ChatService

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("saiam")
settings = get_settings()
service = ChatService()

PERSONAS = {
    "visitor": {"label": "Website visitor", "role": "VISITOR", "org": PUBLIC_ORG, "user": None,
                "blurb": "Not signed in. Can ask about services and request a proposal.",
                "prompts": ["What services do you offer?", "How many revision rounds do I get?",
                            "How much does an e-commerce site cost?", "I'd like a quote for a new website"]},
    "acme_admin": {"label": "Acme Coffee: admin", "role": "CLIENT_ADMIN", "org": "org_acme", "user": "u_acme_admin",
                   "blurb": "Signed in. Sees projects, invoices and Acme's private brief.",
                   "prompts": ["When will our logo deliverable be ready?", "Show my overdue invoices",
                               "Give me a payment link for INV-1002", "What palette does our brand brief specify?",
                               "URGENT: our website is down"]},
    "acme_reviewer": {"label": "Acme Coffee: reviewer", "role": "CLIENT_REVIEWER", "org": "org_acme", "user": "u_acme_rev",
                      "blurb": "Can view projects but has no billing access.",
                      "prompts": ["What deliverables are waiting for my approval?", "How much do we owe?"]},
    "nova_admin": {"label": "Nova Fitness: admin", "role": "CLIENT_ADMIN", "org": "org_nova", "user": "u_nova_admin",
                   "blurb": "A different tenant. Cannot see any Acme data.",
                   "prompts": ["What is the status of our projects?", "What palette does our brand brief specify?",
                               "Show my unpaid invoices"]},
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    embedding_model = get_embedder().name
    if store.count_for_model(embedding_model) == 0:
        log.info("No knowledge indexed with %s: ingesting %s", embedding_model, ingest_all())
    if not settings.demo_mode and settings.internal_secret == "dev-secret":
        log.warning("INTERNAL_SERVICE_SECRET is the default; set a strong secret in production!")
    service.start()
    log.info("LLM=%s embeddings=%s", service.llm.name, get_embedder().name)
    yield
    service.stop()


app = FastAPI(title="Saiam Agent Chatbot", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# ---------------- widget assets ----------------
app.mount("/widget", StaticFiles(directory=str(ROOT / "widget")), name="widget")


@app.get("/chat")
def chat_page():
    return FileResponse(Path(ROOT) / "widget" / "chat.html")


# ---------------- security + rate limiting ----------------
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str) -> None:
    now, q = time.time(), _hits[key]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= settings.rate_limit_per_min:
        raise HTTPException(429, "Too many messages. Please wait a moment.")
    q.append(now)


def trusted_ctx(x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
                x_user_id: str = Header(..., alias="X-User-ID"),
                x_user_role: str = Header(..., alias="X-User-Role"),
                x_internal_secret: str = Header(..., alias="X-Internal-Secret")) -> RequestContext:
    if not hmac.compare_digest(x_internal_secret.encode(), settings.internal_secret.encode()):
        raise HTTPException(403, "Forbidden: invalid service credentials")
    return RequestContext(org_id=x_tenant_id, user_id=x_user_id, role=x_user_role)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    thread_id: str | None = Field(default=None, max_length=64)


def sse_response(ctx: RequestContext, req: ChatRequest) -> StreamingResponse:
    rate_limit(f"{ctx.org_id}:{ctx.user_id}")
    try:
        tid = memory.ensure_thread(ctx, req.thread_id, req.message)
    except PermissionError:
        raise HTTPException(403, "Conversation not found")

    def gen():
        try:
            for ev in service.stream(ctx, req.message.strip(), tid):
                yield f"data: {json.dumps(ev)}\n\n"
        except Exception:
            log.exception("stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Inference interrupted. Please try again.'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


# ---------------- production API (via gateway) ----------------
@app.post("/api/v1/chat/stream")
def chat_stream(req: ChatRequest, ctx: RequestContext = Depends(trusted_ctx)):
    return sse_response(ctx, req)


@app.get("/api/v1/threads")
def threads(ctx: RequestContext = Depends(trusted_ctx)):
    return memory.list_threads(ctx)


@app.get("/api/v1/threads/{thread_id}/messages")
def thread_messages(thread_id: str, ctx: RequestContext = Depends(trusted_ctx)):
    try:
        memory.ensure_thread(ctx, thread_id)
    except PermissionError:
        raise HTTPException(403, "Conversation not found")
    return memory.load_history(thread_id, limit=100)


class IngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=200_000)
    is_global: bool = False


@app.post("/api/v1/knowledge/ingest")
def knowledge_ingest(req: IngestRequest, ctx: RequestContext = Depends(trusted_ctx)):
    """Add/replace a document. Requires SYSTEM_ADMIN. Tenant docs are stored under the caller's org."""
    if not ctx.can("ingest"):
        raise HTTPException(403, "Ingestion requires SYSTEM_ADMIN")
    org = None if req.is_global else ctx.org_id
    n = ingest_text(req.title, req.content, organization_id=org, source=f"api/{org or 'global'}/{req.title}")
    return {"chunks": n, "scope": "global" if org is None else org}


@app.get("/health")
def health():
    return {"status": "ok", "llm": service.llm.name, "embedder": get_embedder().name,
            "chunks": store.count(), "mcp_tools": [t.name for t in service.mcp.tools]}


# ---------------- demo UI ----------------
if settings.demo_mode:
    class DemoChat(ChatRequest):
        persona: str = "visitor"
        session_id: str = Field(default="anon", max_length=40)

    class PublicChat(ChatRequest):
        session_id: str = Field(default="anon", max_length=40)

    @app.get("/api/v1/demo/personas")
    def personas():
        return [{"id": k, **{x: v[x] for x in ("label", "role", "blurb", "prompts")}} for k, v in PERSONAS.items()]

    @app.post("/api/v1/public/chat/stream")
    def public_chat(req: PublicChat):
        ctx = RequestContext(PUBLIC_ORG, f"visitor-{req.session_id}", "VISITOR")
        return sse_response(ctx, req)

    @app.post("/api/v1/demo/chat/stream")
    def demo_chat(req: DemoChat):
        p = PERSONAS.get(req.persona)
        if not p:
            raise HTTPException(400, "Unknown persona")
        uid = p["user"] or f"visitor-{req.session_id}"
        return sse_response(RequestContext(p["org"], uid, p["role"]), req)

    @app.get("/")
    def index():
        return FileResponse(Path(ROOT) / "static" / "index.html")

    app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")
