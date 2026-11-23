"""Find the doc pieces that answer a question.

1. meaning search   pgvector cosine distance on embeddings     (finds "send back" for "return")
2. keyword search   PostgreSQL full-text search                 (finds exact words: "Klarna", "UPS")
3. merge both lists (reciprocal rank fusion), take the best 12
4. re-rank those with a cross-encoder that reads question + piece together
The re-ranker score also decides "is this actually in the docs?" (see settings.min_relevance).
"""

from dataclasses import asdict, dataclass

from sqlalchemy import Text, cast, func, select
from sqlalchemy.orm import Session

from helpdesk.embed import embed_query, rerank
from helpdesk.models import Chunk, Document

CANDIDATES = 20
RRF_K = 60


@dataclass
class Hit:
    chunk_id: int
    document: str
    heading: str
    text: str
    score: float      # re-ranker score: > 0 usually relevant, < -3 usually not

    @property
    def label(self) -> str:
        return f"{self.document} > {self.heading}" if self.heading else self.document

    def to_source(self) -> dict:
        d = asdict(self)
        d["snippet"] = self.text[:280]
        del d["text"]
        return d


def search(db: Session, question: str, k: int = 4) -> list[Hit]:
    q_vec = embed_query(question)
    by_meaning = db.execute(
        select(Chunk.id).order_by(Chunk.embedding.cosine_distance(q_vec)).limit(CANDIDATES)
    ).scalars().all()
    # keyword search, with the words OR-ed together: a question rarely contains *all* the
    # words of its answer ("plainto_tsquery" would AND them)
    words = cast(func.plainto_tsquery("english", question), Text)
    tsq_any = func.to_tsquery("english", func.replace(words, "&", "|"))
    by_words = db.execute(
        select(Chunk.id).where(Chunk.tsv.op("@@")(tsq_any))
        .order_by(func.ts_rank_cd(Chunk.tsv, tsq_any).desc()).limit(CANDIDATES)
    ).scalars().all()

    fused: dict[int, float] = {}
    for ranked in (by_meaning, by_words):
        for rank, cid in enumerate(ranked):
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
    top_ids = sorted(fused, key=fused.get, reverse=True)[:12]
    if not top_ids:
        return []

    rows = db.execute(
        select(Chunk.id, Chunk.heading, Chunk.text, Document.title)
        .join(Document, Document.id == Chunk.document_id).where(Chunk.id.in_(top_ids))
    ).all()
    scores = rerank(question, [f"{r.title} > {r.heading}\n{r.text}" for r in rows])
    hits = [Hit(r.id, r.title, r.heading, r.text, s) for r, s in zip(rows, scores)]
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:k]

