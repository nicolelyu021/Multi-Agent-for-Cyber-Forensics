from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # OpenAI / LiteLLM gateway
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_base_url: str = "https://ai-gateway.andrew.cmu.edu"  # CMU LiteLLM proxy

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "enronpass123"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Forensic
    forensic_db_path: str = "forensic.db"

    # Agent thresholds
    anomaly_threshold: float = 2.0  # z-score
    confidence_threshold: float = 0.7
    deliberation_divergence: float = 0.3  # triggers deliberation when agents disagree

    # Optional: Langfuse
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    model_config = {"env_file": str(Path(__file__).parent / ".env"), "extra": "ignore"}


settings = Settings()
