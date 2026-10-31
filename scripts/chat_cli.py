"""Terminal chat (no FastAPI needed):  python scripts/chat_cli.py [persona]
personas: visitor | acme_admin | acme_reviewer | nova_admin"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.context import RequestContext
from app.db import init_db
from app.rag.ingest import ingest_all
from app.rag.retriever import store
from app.service import ChatService

P = {"visitor": ("public", "cli", "VISITOR"), "acme_admin": ("org_acme", "u_acme_admin", "CLIENT_ADMIN"),
     "acme_reviewer": ("org_acme", "u_acme_rev", "CLIENT_REVIEWER"), "nova_admin": ("org_nova", "u_nova_admin", "CLIENT_ADMIN")}
init_db()
if store.count() == 0:
    ingest_all()
who = sys.argv[1] if len(sys.argv) > 1 else "visitor"
ctx_args, svc, tid = P[who], ChatService(), None
svc.start()
print(f"[{who}] LLM={svc.llm.name}. Ctrl-C to quit.\n")
while True:
    try:
        msg = input("you> ").strip()
    except (EOFError, KeyboardInterrupt):
        break
    if not msg:
        continue
    print("bot> ", end="", flush=True)
    for ev in svc.stream(RequestContext(*ctx_args), msg, tid):
        if ev["type"] == "thread": tid = ev["thread_id"]
        elif ev["type"] == "route": print(f"\n  [route: {ev['agent']}] ", end="")
        elif ev["type"] == "tool" and ev["status"] == "done": print(f"\n  [tool: {ev['name']}] ", end="")
        elif ev["type"] == "token": print(ev["text"], end="", flush=True)
    print("\n")
svc.stop()
