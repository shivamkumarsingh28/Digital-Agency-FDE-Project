"""Ingestion pipeline: load -> chunk -> embed -> store.

CLI:  python -m app.rag.ingest [--reset]
Layout:  data/knowledge/global/*.md          -> visible to everyone
         data/knowledge/tenants/<org_id>/*   -> visible only to that organisation
"""
from __future__ import annotations
import re
import sys
from pathlib import Path
from .chunker import chunk_document
from .embeddings import get_embedder
from .retriever import store
from ..config import get_settings
from ..db import init_db


def ingest_text(title: str, text: str, *, organization_id: str | None, source: str) -> int:
    """organization_id=None => global knowledge."""
    s = get_settings()
    chunks = chunk_document(text, title, s.chunk_size, s.chunk_overlap)
    if not chunks:
        return 0
    emb = get_embedder()
    vecs = emb.embed([c.content for c in chunks])
    rows = [{"is_global": int(organization_id is None), "organization_id": organization_id,
             "title": title, "heading": c.heading, "content": c.content} for c in chunks]
    return store.replace_source(source, rows, vecs, emb.name)


def ingest_all(reset: bool = False) -> dict[str, int]:
    init_db()
    if reset:
        store.clear()
    root = get_settings().knowledge_dir
    report: dict[str, int] = {}
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in {".md", ".txt"} or not path.is_file():
            continue
        rel = path.relative_to(root)
        org = rel.parts[1] if rel.parts[0] == "tenants" and len(rel.parts) > 2 else None
        text = path.read_text(encoding="utf-8")
        m = re.search(r"^#\s+(.*)", text, re.M)
        title = m.group(1).strip() if m else path.stem.replace("_", " ").title()
        report[str(rel)] = ingest_text(title, text, organization_id=org, source=str(rel))
    return report


if __name__ == "__main__":
    rep = ingest_all(reset="--reset" in sys.argv)
    for k, v in rep.items():
        print(f"{v:3d} chunks  {k}")
    print(f"total: {sum(rep.values())} chunks, embedder={get_embedder().name}")
