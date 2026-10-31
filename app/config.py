"""Central settings, read from environment / .env."""
from __future__ import annotations
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.split("#", 1)[0].strip())


def _f(name: str, default: str) -> str:
    return os.environ.get(name, "") or default


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    ollama_base_url: str
    ollama_model: str
    openai_api_key: str
    openai_base_url: str
    openai_model: str
    anthropic_api_key: str
    anthropic_model: str
    embeddings_provider: str
    embedding_model: str
    db_path: str
    knowledge_dir: Path
    internal_secret: str
    demo_mode: bool
    rate_limit_per_min: int
    chunk_size: int
    chunk_overlap: int
    top_k: int
    min_score: float
    faithfulness_min: float
    mcp_config: Path
    payment_link_base: str
    escalation_webhook: str
    allowed_origins: list[str]


def get_settings() -> Settings:
    _load_dotenv()
    oa, an = os.environ.get("OPENAI_API_KEY", ""), os.environ.get("ANTHROPIC_API_KEY", "")
    provider = _f("LLM_PROVIDER", "openai" if oa else "anthropic" if an else "mock")
    return Settings(
        llm_provider=provider,
        ollama_base_url=_f("OLLAMA_BASE_URL", "http://localhost:11434"),
        ollama_model=_f("OLLAMA_MODEL", "llama3.2"),
        openai_api_key=oa,
        openai_base_url=os.environ.get("OPENAI_BASE_URL", ""),
        openai_model=_f("OPENAI_MODEL", "gpt-4o"),
        anthropic_api_key=an,
        anthropic_model=_f("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
        embeddings_provider=_f("EMBEDDINGS_PROVIDER", "hash"),
        embedding_model=_f("EMBEDDING_MODEL", "text-embedding-3-small"),
        db_path=_f("DB_PATH", str(ROOT / "data" / "saiam.db")),
        knowledge_dir=Path(_f("KNOWLEDGE_DIR", str(ROOT / "data" / "knowledge"))),
        internal_secret=_f("INTERNAL_SERVICE_SECRET", "dev-secret"),
        demo_mode=_f("DEMO_MODE", "1") == "1",
        rate_limit_per_min=int(_f("RATE_LIMIT_PER_MIN", "20")),
        chunk_size=int(_f("CHUNK_SIZE", "900")),
        chunk_overlap=int(_f("CHUNK_OVERLAP", "120")),
        top_k=int(_f("TOP_K", "4")),
        min_score=float(_f("MIN_SCORE", "0.12")),
        faithfulness_min=float(_f("FAITHFULNESS_MIN", "0.5")),
        mcp_config=ROOT / _f("MCP_CONFIG", "mcp_servers.json"),
        payment_link_base=_f("PAYMENT_LINK_BASE", "https://pay.saiam.example/checkout"),
        escalation_webhook=os.environ.get("ESCALATION_WEBHOOK_URL", ""),
        allowed_origins=["*"] if _f("ALLOWED_ORIGINS", "*") == "*" else [
            origin.strip() for origin in _f("ALLOWED_ORIGINS", "*").split(",") if origin.strip()
        ],
    )
