"""Embedding backends. `hash` is fully offline; `openai` is the production default."""
from __future__ import annotations
import json
import math
import re
import urllib.request
import zlib
from functools import lru_cache
import numpy as np
from ..config import get_settings

STOP = set("a an the and or of to in on for with is are was were be been it this that these those at by from as "
           "do does did can could would should will my our your we you i me us they them their what how when where "
           "who which about any there so if not no but have has had".split())


def tokenize(text: str) -> list[str]:
    toks = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for t in toks:
        if t in STOP:
            continue
        if len(t) > 4 and t.endswith("ing"):
            t = t[:-3]
        elif len(t) > 3 and t.endswith("ed"):
            t = t[:-2]
        elif len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        out.append(t)
    return out


class HashEmbedder:
    """Signed feature-hashing of unigrams+bigrams. Deterministic, no network, decent lexical recall."""
    name = "hash-768"
    dim = 768

    def embed(self, texts: list[str]) -> np.ndarray:
        m = np.zeros((len(texts), self.dim), dtype=np.float32)
        for i, text in enumerate(texts):
            toks = tokenize(text)
            feats: dict[str, int] = {}
            for j, t in enumerate(toks):
                feats[t] = feats.get(t, 0) + 1
                if j:
                    b = toks[j - 1] + "_" + t
                    feats[b] = feats.get(b, 0) + 1
            for f, c in feats.items():
                h = zlib.crc32(f.encode())
                m[i, h % self.dim] += (1.0 if (h >> 16) & 1 else -1.0) * (1 + math.log(c))
        n = np.linalg.norm(m, axis=1, keepdims=True)
        return m / np.where(n == 0, 1, n)


class OpenAIEmbedder:
    dim = 1536

    def __init__(self):
        from openai import OpenAI
        s = get_settings()
        self.client = OpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url or None)
        self.model = s.embedding_model
        self.name = f"openai-{self.model}"

    def embed(self, texts: list[str]) -> np.ndarray:
        vecs = []
        for i in range(0, len(texts), 96):
            r = self.client.embeddings.create(model=self.model, input=texts[i:i + 96])
            vecs += [d.embedding for d in r.data]
        m = np.array(vecs, dtype=np.float32)
        return m / np.where(np.linalg.norm(m, axis=1, keepdims=True) == 0, 1, np.linalg.norm(m, axis=1, keepdims=True))


class OllamaEmbedder:
    def __init__(self):
        s = get_settings()
        self.model = s.embedding_model
        self.name = f"ollama-{self.model}"
        self.url = s.ollama_base_url.rstrip("/")
        if self.url.endswith("/v1"):
            self.url = self.url[:-3]
        self.url += "/api/embed"

    def embed(self, texts: list[str]) -> np.ndarray:
        vectors = []
        for i in range(0, len(texts), 96):
            body = json.dumps({"model": self.model, "input": texts[i:i + 96]}).encode("utf-8")
            request = urllib.request.Request(
                self.url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.load(response)
            batch = payload.get("embeddings") if isinstance(payload, dict) else None
            if not isinstance(batch, list) or len(batch) != len(texts[i:i + 96]):
                raise RuntimeError("Ollama returned an invalid embeddings response")
            vectors.extend(batch)

        if not vectors:
            return np.zeros((0, 0), dtype=np.float32)
        matrix = np.asarray(vectors, dtype=np.float32)
        if matrix.ndim != 2 or matrix.shape[1] == 0:
            raise RuntimeError("Ollama returned embeddings with an invalid shape")
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        return matrix / np.where(norms == 0, 1, norms)


@lru_cache(maxsize=1)
def get_embedder():
    provider = get_settings().embeddings_provider
    if provider == "openai":
        return OpenAIEmbedder()
    if provider == "ollama":
        return OllamaEmbedder()
    if provider == "hash":
        return HashEmbedder()
    raise ValueError(f"Unsupported EMBEDDINGS_PROVIDER: {provider}")
