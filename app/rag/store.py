"""Tenant-isolated vector store.

Isolation rule (mirrors the RLS policy in the design doc):
    visible  <=>  is_global = 1  OR  organization_id = <verified tenant>
`tenant_id` is a REQUIRED argument - there is no code path that reads chunks without it,
and an empty tenant sees global chunks only (fail closed).

Production path: replace with Postgres + pgvector (HNSW) + FORCE ROW LEVEL SECURITY using
`set_config('app.tenant_id', :tid, true)`; the `VectorStore` interface stays the same.
"""
from __future__ import annotations
import numpy as np
from ..db import connect


class VectorStore:
    def replace_source(self, source: str, rows: list[dict], vectors: np.ndarray, model: str) -> int:
        with connect() as c:
            c.execute("DELETE FROM knowledge_chunks WHERE source = ?", (source,))
            c.executemany(
                "INSERT INTO knowledge_chunks(is_global, organization_id, source, title, heading, content,"
                " embedding, embed_model, dim) VALUES (?,?,?,?,?,?,?,?,?)",
                [(r["is_global"], r["organization_id"], source, r["title"], r["heading"], r["content"],
                  vectors[i].astype(np.float32).tobytes(), model, vectors.shape[1]) for i, r in enumerate(rows)])
        return len(rows)

    def clear(self) -> None:
        with connect() as c:
            c.execute("DELETE FROM knowledge_chunks")

    def load_visible(self, tenant_id: str | None, model: str):
        """Return (rows, matrix) of chunks visible to this tenant for the given embedding model."""
        tid = tenant_id or "__none__"
        with connect(readonly=True) as c:
            rows = c.execute(
                "SELECT id, is_global, organization_id, source, title, heading, content, embedding, dim "
                "FROM knowledge_chunks WHERE embed_model = ? AND (is_global = 1 OR organization_id = ?)",
                (model, tid)).fetchall()
        if not rows:
            return [], np.zeros((0, 1), dtype=np.float32)
        mat = np.vstack([np.frombuffer(r["embedding"], dtype=np.float32) for r in rows])
        return rows, mat

    def count(self) -> int:
        with connect(readonly=True) as c:
            return c.execute("SELECT COUNT(*) FROM knowledge_chunks").fetchone()[0]

    def count_for_model(self, model: str) -> int:
        with connect(readonly=True) as c:
            return c.execute("SELECT COUNT(*) FROM knowledge_chunks WHERE embed_model = ?", (model,)).fetchone()[0]
