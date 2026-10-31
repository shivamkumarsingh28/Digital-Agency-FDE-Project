# Saiam Agent Chatbot

A standalone, multi-agent AI chatbot for Saiam Digital Agency, built from the two system-design documents.
It is **only the chatbot service** (no website, no portal): a Python FastAPI + LangGraph service with RAG,
tool calling, MCP, guardrails, and a small chat UI for demoing. The Next.js gateway in your design simply
proxies to it.

## What's inside

| Capability | Where |
|---|---|
| Multi-agent supervisor (LangGraph): FAQ, Project, Billing, Lead/Escalation, Integrations (MCP) | `app/agents/graph.py` |
| RAG: markdown-aware chunking, embeddings, hybrid (dense + BM25) retrieval, tenant isolation | `app/rag/` |
| Tool calling: typed, tenant-bound, read-only, audited, role-gated | `app/tools/` |
| MCP **server** (exposes the tools to Claude Desktop, Cursor, etc.) | `app/mcp_layer/server.py` |
| MCP **client** (plugs external MCP servers into the Integrations agent) | `app/mcp_layer/client.py` |
| Guardrails: injection screen, RBAC gate, PII/key redaction, faithfulness check | `app/guardrails.py` |
| Conversation memory per tenant + user | `app/memory.py` |
| Streaming SSE API + demo UI | `app/main.py`, `static/index.html` |
| Offline mode (no API key needed) | `app/agents/mock_agents.py` |

```
message -> guard_in -> SUPERVISOR -> RBAC gate -> specialist agent (tools) -> guard_out -> SSE tokens
                                                                                (redact + faithfulness)
```

## Run it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # configure Ollama, OpenAI, Anthropic, or mock mode
ollama pull llama3.2
ollama pull nomic-embed-text
python -m app.rag.ingest --reset
uvicorn app.main:app --reload --port 8000     # open http://localhost:8000
```

Set `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`, and
`EMBEDDINGS_PROVIDER=ollama` to use your local Ollama server for chat, tool calls, and semantic embeddings.
The backend uses Ollama's OpenAI-compatible `/v1` chat API and its native `/api/embed` endpoint.
Docker Compose starts Ollama itself, pulls the configured chat and embedding models, and connects to it over
the internal `ollama` service URL. Use `LLM_PROVIDER=mock` and `EMBEDDINGS_PROVIDER=hash` for fully offline
deterministic mode, or configure OpenAI/Anthropic API keys for hosted LLMs.

`/chat` serves the standalone widget page and `/widget/saiam-chat-widget.js` serves its script. When embedding
the widget on a different website, configure `ALLOWED_ORIGINS` as a comma-separated list of that website's
origins; `*` is suitable only for local demos.

Without a browser: `python scripts/chat_cli.py acme_admin`. Tests: `python -m unittest discover -s tests -v`.

The UI has four demo identities to show the security model: a visitor, Acme admin, Acme reviewer (no billing),
and Nova admin (a different tenant that cannot see Acme's data).
With `DEMO_MODE=1`, the standalone widget is available at `http://localhost:8000/chat`; the default
visitor-only widget endpoint is also enabled only in demo mode. For production embeds, set `data-endpoint`
to your authenticated gateway route.

## Your documents (RAG)

Put `.md`/`.txt` files in:
- `data/knowledge/global/` visible to everyone (services, FAQ, pricing, policies)
- `data/knowledge/tenants/<org_id>/` visible only to that client

then run `python -m app.rag.ingest`. The files shipped are **sample content I wrote**: replace them with
Saiam's real services, FAQs and policies. Or `POST /api/v1/knowledge/ingest` (SYSTEM_ADMIN).

## Connecting to your Next.js gateway

Your existing proxy route (from the design doc) works unchanged: it sends
`X-Tenant-ID`, `X-User-ID`, `X-User-Role`, `X-Internal-Secret` to `POST /api/v1/chat/stream` with
`{ "message": "...", "thread_id": "..." }` and streams the response. Roles: `VISITOR`, `CLIENT_REVIEWER`,
`CLIENT_ADMIN`, `SPECIALIST`, `ACCOUNT_MANAGER`, `SYSTEM_ADMIN` (see `app/context.py`).
For logged-out visitors send `X-Tenant-ID: public`, `X-User-Role: VISITOR`.
SSE events: `thread`, `route`, `tool`, `guard`, `sources`, `token`, `error`, then `[DONE]`.

**Before production:** `DEMO_MODE=0` (removes the unauthenticated demo endpoint), set a strong
`INTERNAL_SERVICE_SECRET`, keep the service on the private network (mTLS as in the design).

## MCP

- **As a server:** `SAIAM_ORG_ID=org_acme SAIAM_USER_ROLE=CLIENT_ADMIN python -m app.mcp_layer.server`
  (stdio). Tenant identity comes from the environment, never from model-supplied arguments.
- **As a client:** copy `mcp_servers.example.json` to `mcp_servers.json`. Tools from those servers appear to the
  Integrations agent for `CLIENT_ADMIN` and above only. Vet any server you enable: each one is a new trust boundary.

## Moving from the demo stack to your design's stack

| Demo | Production (from your design) |
|---|---|
| SQLite (`app/db.py`) | PostgreSQL; the SQL in `tools/builtin.py` is parameterised and portable |
| `rag/store.py` NumPy scan | Postgres + pgvector HNSW + `FORCE ROW LEVEL SECURITY` (same `VectorStore` interface) |
| `memory.py` thread table | keep, and add LangGraph `AsyncPostgresSaver` if you need graph-level checkpoints |
| `create_payment_link` placeholder | Stripe Checkout Session |
| lexical faithfulness check | LLM judge at runtime + Ragas in CI (faithfulness >= 0.90 gate) |

## Evaluation
`python scripts/eval_rag.py` gives a retrieval hit-rate check (currently 10/10 at k=3 on the sample docs).
Add Ragas (faithfulness, answer relevancy, context recall) on your own Q/A set once real documents are loaded.
