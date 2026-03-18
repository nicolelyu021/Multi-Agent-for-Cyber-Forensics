"""Optional embedding comparison tool for semantic similarity analysis."""
from openai import AsyncOpenAI

from config import settings
from forensic.wrapper import forensic_tool

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
    return _client


@forensic_tool("embedding_similarity", "sentiment_analyzer")
async def compute_similarity(text_a: str, text_b: str, trace_id: str = "unknown") -> dict:
    """Compute cosine similarity between two text passages using embeddings."""
    client = _get_client()
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=[text_a, text_b],
    )
    emb_a = response.data[0].embedding
    emb_b = response.data[1].embedding

    dot = sum(a * b for a, b in zip(emb_a, emb_b))
    norm_a = sum(a * a for a in emb_a) ** 0.5
    norm_b = sum(b * b for b in emb_b) ** 0.5
    similarity = dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    return {"similarity": round(similarity, 4)}
