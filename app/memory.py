"""Tenant- and user-scoped conversation memory (the 'chat_conversations' registry in the design)."""
from __future__ import annotations
import json
import uuid
from .context import RequestContext
from .db import connect


def ensure_thread(ctx: RequestContext, thread_id: str | None, first_message: str = "") -> str:
    with connect() as c:
        if thread_id:
            row = c.execute("SELECT organization_id, user_id FROM threads WHERE thread_id = ?", (thread_id,)).fetchone()
            if row:
                if row["organization_id"] != ctx.org_id or row["user_id"] != ctx.user_id:
                    raise PermissionError("thread belongs to another user")
                return thread_id
        tid = thread_id if (thread_id and len(thread_id) < 64) else uuid.uuid4().hex
        c.execute("INSERT INTO threads(thread_id, organization_id, user_id, title) VALUES (?,?,?,?)",
                  (tid, ctx.org_id, ctx.user_id, (first_message[:60] or "New conversation")))
        return tid


def load_history(thread_id: str, limit: int = 10) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT role, content FROM messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?",
                         (thread_id, limit)).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def append(thread_id: str, role: str, content: str, meta: dict | None = None) -> None:
    with connect() as c:
        c.execute("INSERT INTO messages(thread_id, role, content, meta) VALUES (?,?,?,?)",
                  (thread_id, role, content, json.dumps(meta or {})))
        c.execute("UPDATE threads SET updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?", (thread_id,))


def list_threads(ctx: RequestContext, limit: int = 20) -> list[dict]:
    with connect() as c:
        rows = c.execute("SELECT thread_id, title, updated_at FROM threads WHERE organization_id = ? AND user_id = ? "
                         "ORDER BY updated_at DESC LIMIT ?", (ctx.org_id, ctx.user_id, limit)).fetchall()
    return [dict(r) for r in rows]
