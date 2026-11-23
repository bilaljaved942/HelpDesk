"""Text -> vectors (for meaning search) and a re-ranker (for "how relevant is this, really?").

Both are small ONNX models that run on the CPU through fastembed: free, local, no PyTorch.
  embedder  BAAI/bge-small-en-v1.5        384 numbers per text, compared by cosine similarity
  reranker  ms-marco-MiniLM-L-6-v2        reads (question, passage) together, gives a score
"""

from functools import lru_cache

import numpy as np

from helpdesk.settings import get_settings

# bge models work best when the *question* (not the passages) gets this prefix
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


@lru_cache
def _embedder():
    from fastembed import TextEmbedding

    return TextEmbedding(get_settings().embed_model)


@lru_cache
def _reranker():
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(get_settings().rerank_model)


def embed_passages(texts: list[str]) -> list[np.ndarray]:
    return list(_embedder().embed(texts, batch_size=32))


def embed_query(text: str) -> np.ndarray:
    return next(iter(_embedder().embed([QUERY_PREFIX + text])))


def rerank(query: str, passages: list[str]) -> list[float]:
    if not passages:
        return []
    return [float(s) for s in _reranker().rerank(query, passages)]
