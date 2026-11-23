"""App settings, read from environment variables (or a .env file in the repo root)."""

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_prefix="HELPDESK_", extra="ignore")

    database_url: str = "postgresql+psycopg://helpdesk:helpdesk@127.0.0.1:5434/helpdesk"
    storage_dir: Path = ROOT / "outputs" / "docs"

    # LLM (local, through Ollama). Swap the provider in helpdesk/llm.py.
    ollama_url: str = "http://127.0.0.1:11434"
    llm_model: str = "qwen3:8b"
    embed_model: str = "BAAI/bge-small-en-v1.5"       # 384-dim, runs on CPU via fastembed (ONNX)
    rerank_model: str = "Xenova/ms-marco-MiniLM-L-6-v2"

    # Agent behaviour
    # Re-ranker score below this = "not in the docs", skip the model. Set low on purpose: some real
    # answers score about -5 ("between M and L, which size?"). Pieces that pass still face the
    # model's NOT_IN_DOCS check and the must-cite-a-source rule.
    min_relevance: float = -6.5
    top_k: int = 4                   # doc pieces given to the model
    max_failures: int = 2            # "not sure" answers in a row before handing off
    history_turns: int = 6           # past messages the agent sees

    # HubSpot (optional). Empty token = tickets stay in our DB only.
    hubspot_token: str = ""

    # Auth for the support dashboard
    jwt_secret: str = ""
    session_days: int = 7
    cookie_secure: bool = False
    max_upload_mb: int = 10


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret:
        # Local dev: keep one random secret on disk so logins survive restarts.
        path = ROOT / "outputs" / ".dev_jwt_secret"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(secrets.token_urlsafe(48))
        s.jwt_secret = path.read_text().strip()
    return s
