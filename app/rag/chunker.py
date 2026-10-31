"""Markdown-aware recursive chunking with overlap.

1. Split the document into sections at markdown headings (keeps topical coherence).
2. Recursively split oversized sections: paragraph -> line -> sentence -> word.
3. Greedily merge pieces up to `size` chars, carrying `overlap` chars into the next chunk.
4. Prefix each chunk with "Title > Heading" so it is self-describing when retrieved.
"""
from __future__ import annotations
import re
from dataclasses import dataclass

_SEPS = ["\n\n", "\n", ". ", " "]


@dataclass
class Chunk:
    heading: str
    content: str          # includes the "Title > Heading" prefix


def _atoms(text: str, size: int, seps: list[str]) -> list[str]:
    text = text.strip()
    if len(text) <= size:
        return [text] if text else []
    if not seps:
        return [text[i:i + size] for i in range(0, len(text), size)]
    sep, rest = seps[0], seps[1:]
    if sep not in text:
        return _atoms(text, size, rest)
    out: list[str] = []
    for part in text.split(sep):
        out.extend(_atoms(part + (sep.strip() if sep == ". " else ""), size, rest))
    return out


def _merge(atoms: list[str], size: int, overlap: int) -> list[str]:
    chunks: list[str] = []
    cur: list[str] = []
    length = 0
    for a in atoms:
        if cur and length + len(a) + 1 > size:
            chunks.append(" ".join(cur))
            tail: list[str] = []
            tl = 0
            for prev in reversed(cur):                 # carry overlap
                if tl + len(prev) > overlap:
                    break
                tail.insert(0, prev)
                tl += len(prev) + 1
            cur, length = tail, tl
        cur.append(a)
        length += len(a) + 1
    if cur:
        chunks.append(" ".join(cur))
    return chunks


def _sections(text: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []
    heading, buf = "", []
    for line in text.splitlines():
        m = re.match(r"^(#{1,4})\s+(.*)", line)
        if m:
            if "".join(buf).strip():
                sections.append((heading, "\n".join(buf)))
            heading, buf = m.group(2).strip(), []
        else:
            buf.append(line)
    if "".join(buf).strip():
        sections.append((heading, "\n".join(buf)))
    return sections


def chunk_document(text: str, title: str, size: int = 900, overlap: int = 120) -> list[Chunk]:
    out: list[Chunk] = []
    for heading, body in _sections(text):
        prefix = f"{title} > {heading}" if heading and heading != title else title
        for piece in _merge(_atoms(body, size, _SEPS), size, overlap):
            out.append(Chunk(heading=heading or title, content=f"[{prefix}]\n{piece}"))
    return out
