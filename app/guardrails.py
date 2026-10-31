"""Input and output guardrails: injection screen, redaction, faithfulness audit."""
from __future__ import annotations
import re
from .rag.embeddings import tokenize

INJECTION = re.compile(
    r"(ignore (all |any )?(previous|prior|above) (instructions|rules)|disregard (the )?(system|previous)|"
    r"reveal (your )?(system )?prompt|show (me )?(your )?(system )?prompt|you are now|act as (dan|an? unrestricted)|"
    r"developer mode|jailbreak|bypass (your )?(rules|guardrails|restrictions)|"
    r"as (the )?(admin|administrator|system administrator)[, ]+(show|list|give)|other (client|tenant|organi[sz]ation)'?s? (data|invoices|projects))",
    re.I)

REDACTIONS = [
    (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I), "[id]"),
    (re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}\b"), "[redacted-key]"),
    (re.compile(r"\b(?:\d[ -]?){13,16}\b"), "[redacted-number]"),
    (re.compile(r"\b(?:AKIA|ghp_|xox[bp]-)[A-Za-z0-9\-]{8,}\b"), "[redacted-key]"),
]

INJECTION_REPLY = ("I can only help with Saiam's services, your projects and invoices, and connecting you with the "
                   "team. I can't follow instructions that try to change my rules or access other organisations' data.")
NO_ANSWER_REPLY = ("I don't have reliable information on that. I'd rather not guess, so I can connect you with an "
                   "account manager who can confirm. Would you like that?")


def screen_input(text: str) -> bool:
    """True if the message looks like a prompt-injection / data-exfiltration attempt."""
    return bool(INJECTION.search(text))


def redact(text: str) -> str:
    for pat, repl in REDACTIONS:
        text = pat.sub(repl, text)
    return text


def faithfulness(answer: str, sources: list[str]) -> float:
    """Fraction of answer sentences whose content words are mostly present in the retrieved text.
    Cheap lexical proxy for the Ragas faithfulness metric (use Ragas offline for real scoring)."""
    ctx_tokens = set(tokenize(" ".join(sources)))
    sentences = [s for s in re.split(r"(?<=[.!?])\s+|\n+", answer) if len(tokenize(s)) >= 4]
    if not sentences:
        return 1.0
    ok = 0
    for s in sentences:
        toks = tokenize(s)
        if sum(t in ctx_tokens for t in toks) / len(toks) >= 0.4:
            ok += 1
    return ok / len(sentences)
