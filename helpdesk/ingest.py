"""Uploaded help doc -> clean text -> small searchable pieces ("chunks") -> database.

Pieces follow the document's own sections (headings), so each one is about one topic
and the answer can say exactly where it came from ("Returns and Refunds Policy > Footwear").
Long sections are split on paragraph boundaries.
"""

import io
import re
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from helpdesk.embed import embed_passages
from helpdesk.models import Chunk, Document

MAX_CHARS = 1200      # longer sections are split into pieces about this size
SUPPORTED = {".md", ".markdown", ".txt", ".pdf", ".docx"}


@dataclass
class Piece:
    heading: str
    text: str


def read_text(filename: str, data: bytes) -> str:
    """File bytes -> text, with headings kept as markdown '#' lines where we can tell."""
    ext = Path(filename).suffix.lower()
    if ext in {".md", ".markdown", ".txt"}:
        return data.decode("utf-8", errors="replace")
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages)
    if ext == ".docx":
        import docx

        out = []
        for p in docx.Document(io.BytesIO(data)).paragraphs:
            style = (p.style.name or "").lower() if p.style else ""
            if style.startswith("heading") or style == "title":
                level = 1 if style == "title" else int(re.sub(r"\D", "", style) or 2)
                out.append("#" * min(level, 3) + " " + p.text)
            elif p.text.strip():
                out.append(p.text)
        return "\n\n".join(out)
    raise ValueError(f"Unsupported file type '{ext}'. Use: {', '.join(sorted(SUPPORTED))}")


def title_of(text: str, filename: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else Path(filename).stem.replace("_", " ").replace("-", " ").title()


def split(text: str) -> list[Piece]:
    """Split on markdown headings (##, ###); split long sections on paragraphs."""
    pieces: list[Piece] = []
    heading = ""
    buf: list[str] = []

    def flush():
        body = "\n".join(buf).strip()
        if body:
            pieces.extend(_split_long(heading, body))
        buf.clear()

    for line in text.splitlines():
        m = re.match(r"^(#{1,4})\s+(.+)$", line)
        if m:
            flush()
            heading = "" if len(m.group(1)) == 1 else m.group(2).strip()   # '#' is the doc title
        else:
            buf.append(line)
    flush()
    return pieces


def _split_long(heading: str, body: str) -> list[Piece]:
    if len(body) <= MAX_CHARS:
        return [Piece(heading, body)]
    out, cur = [], ""
    for para in re.split(r"\n\s*\n", body):
        if cur and len(cur) + len(para) > MAX_CHARS:
            out.append(Piece(heading, cur.strip()))
            cur = ""
        cur += para + "\n\n"
    if cur.strip():
        out.append(Piece(heading, cur.strip()))
    return out


def add_document(db: Session, filename: str, data: bytes) -> Document:
    text = read_text(filename, data)
    if len(text.strip()) < 20:
        raise ValueError("This file has no readable text (is it a scanned PDF?).")
    title = title_of(text, filename)
    pieces = split(text)
    # The title and heading go into the embedded text too: "Footwear" alone means little,
    # "Returns and Refunds Policy > Footwear" says what the piece is about.
    vectors = embed_passages([f"{title} > {p.heading}\n{p.text}" for p in pieces])
    doc = Document(title=title, filename=filename, content=text, n_chunks=len(pieces), n_words=len(text.split()))
    doc.chunks = [Chunk(idx=i, heading=p.heading, text=p.text, embedding=v)
                  for i, (p, v) in enumerate(zip(pieces, vectors))]
    db.add(doc)
    db.commit()
    return doc
