"""Hybrid retrieval: dense cosine + keyword (BM25-style), fused with reciprocal-rank fusion."""
from __future__ import annotations
import math
from .embeddings import get_embedder, tokenize
from .store import VectorStore
from ..config import get_settings

store = VectorStore()


def search(tenant_id: str | None, query: str, k: int | None = None) -> list[dict]:
    s = get_settings()
    k = k or s.top_k
    emb = get_embedder()
    rows, mat = store.load_visible(tenant_id, emb.name)
    if not rows:
        return []
    q = emb.embed([query])[0]
    dense = mat @ q

    q_toks = set(tokenize(query))
    docs = [tokenize(r["content"]) for r in rows]
    n = len(docs)
    avg = sum(len(d) for d in docs) / max(n, 1) or 1
    df = {t: sum(1 for d in docs if t in d) for t in q_toks}
    kw = []
    for d in docs:
        score = 0.0
        for t in q_toks:
            tf = d.count(t)
            if tf:
                idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * len(d) / avg))
        kw.append(score)
    kw_max = max(kw) or 1.0

    d_rank = {i: r for r, i in enumerate(sorted(range(n), key=lambda i: -dense[i]))}
    k_rank = {i: r for r, i in enumerate(sorted(range(n), key=lambda i: -kw[i]))}
    fused = sorted(range(n), key=lambda i: -(1 / (60 + d_rank[i]) + (1 / (60 + k_rank[i]) if kw[i] > 0 else 0)))

    hits = []
    for i in fused:
        if dense[i] < s.min_score and kw[i] / kw_max < 0.25:
            continue
        r = rows[i]
        hits.append({"title": r["title"], "heading": r["heading"], "content": r["content"],
                     "source": r["source"], "scope": "global" if r["is_global"] else "tenant",
                     "score": round(float(dense[i]), 3)})
        if len(hits) >= k:
            break
    return hits
