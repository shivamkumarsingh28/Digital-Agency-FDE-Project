"""Retrieval regression check: hit-rate@k over a small labelled set. Run before changing
chunking / embeddings. For LLM-judged faithfulness & answer relevancy use Ragas on top of this
(see README 'Evaluation')."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db import init_db
from app.rag.ingest import ingest_all
from app.rag import retriever

CASES = [("How many revision rounds do I get?", "Revision policy"),
         ("How long does a brand identity project take?", "Brand Identity and Design"),
         ("What is your cancellation policy?", "Cancellation and refunds"),
         ("How quickly do you respond to urgent issues?", "Support SLA"),
         ("Do you sign NDAs?", "Do you sign NDAs?"),
         ("What does Pending Client Approval mean?", "What do the deliverable statuses mean?"),
         ("How much is the SEO Growth retainer?", "Monthly retainers"),
         ("When are invoices due?", "Payment terms"),
         ("Who owns the final files?", "Who owns the final work?"),
         ("What tech stack do you build websites with?", "Website Design and Development")]
init_db(); ingest_all(reset=True)
hits = 0
for q, expected in CASES:
    heads = [h["heading"] for h in retriever.search(None, q, 3)]
    ok = expected in heads; hits += ok
    print(("PASS" if ok else "FAIL"), q, "->", heads)
print(f"\nhit-rate@3 = {hits}/{len(CASES)}")
