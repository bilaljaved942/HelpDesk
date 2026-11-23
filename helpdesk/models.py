"""Database tables.

users          support team (dashboard logins)
documents      uploaded help docs;  chunks = their searchable pieces (+ embedding)
conversations  one customer chat;   messages = what was said, by whom, with sources
tickets        work for a human (also copied to HubSpot)
orders         shop orders (placed in the store or seeded), used by the "look up order" tool
products       the store catalogue;  customers = shoppers' accounts (separate from team users)
"""

import secrets
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Computed, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from helpdesk.db import Base

EMBED_DIM = 384


def _id() -> str:
    return secrets.token_hex(16)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    title: Mapped[str] = mapped_column(String(200))
    filename: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, default="")   # full text, shown in the store's help center
    n_chunks: Mapped[int] = mapped_column(Integer, default=0)
    n_words: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    chunks: Mapped[list["Chunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    heading: Mapped[str] = mapped_column(String(300), default="")
    text: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(EMBED_DIM))
    # keyword search, kept up to date by PostgreSQL itself
    tsv = mapped_column(TSVECTOR, Computed("to_tsvector('english', heading || ' ' || text)", persisted=True))
    document: Mapped[Document] = relationship(back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_tsv", "tsv", postgresql_using="gin"),
        Index("ix_chunks_embedding", "embedding", postgresql_using="hnsw",
              postgresql_ops={"embedding": "vector_cosine_ops"}),
    )


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    token: Mapped[str] = mapped_column(String(64), default=lambda: secrets.token_urlsafe(32))  # customer's key
    customer_name: Mapped[str] = mapped_column(String(120), default="")
    customer_email: Mapped[str] = mapped_column(String(320), default="")
    # ai = the agent answers; human = a team member took over; closed = done
    status: Mapped[str] = mapped_column(String(16), default="ai", index=True)
    resolution: Mapped[str] = mapped_column(String(16), default="")   # ai | human (who solved it)
    handoff_reason: Mapped[str] = mapped_column(String(200), default="")
    failures: Mapped[int] = mapped_column(Integer, default=0)
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan",
                                                     order_by="Message.id")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))         # customer | ai | agent | system
    content: Mapped[str] = mapped_column(Text)
    author: Mapped[str] = mapped_column(String(120), default="")   # team member's name for role=agent
    sources: Mapped[list] = mapped_column(JSON, default=list)      # [{document, heading, snippet}]
    meta: Mapped[dict] = mapped_column(JSON, default=dict)         # route, intent, mood, tool calls, timing
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)   # shown to people: #1001
    conversation_id: Mapped[str | None] = mapped_column(ForeignKey("conversations.id", ondelete="SET NULL"),
                                                        nullable=True, index=True)
    subject: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40), default="other")   # refund, order, shipping, ...
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # low | medium | high
    status: Mapped[str] = mapped_column(String(16), default="open")      # open | in_progress | solved
    customer_email: Mapped[str] = mapped_column(String(320), default="")
    order_number: Mapped[str] = mapped_column(String(20), default="")
    notes: Mapped[list] = mapped_column(JSON, default=list)              # [{at, by, text}]
    hubspot_id: Mapped[str] = mapped_column(String(40), default="")
    hubspot_status: Mapped[str] = mapped_column(String(16), default="off")  # off | pending | synced | failed
    hubspot_error: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Customer(Base):
    """A shopper's store account (team members are in `users`)."""
    __tablename__ = "customers"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Product(Base):
    __tablename__ = "products"
    slug: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(40), index=True)
    price: Mapped[float] = mapped_column(Float)
    compare_at: Mapped[float | None] = mapped_column(Float, nullable=True)   # old price when on sale
    description: Mapped[str] = mapped_column(Text, default="")
    features: Mapped[list] = mapped_column(JSON, default=list)
    sizes: Mapped[list] = mapped_column(JSON, default=list)
    colors: Mapped[list] = mapped_column(JSON, default=list)                  # [{name, hex}]
    art: Mapped[str] = mapped_column(String(20), default="")                  # which illustration to draw
    bg: Mapped[str] = mapped_column(String(12), default="#eeeeee")
    rating: Mapped[float] = mapped_column(Float, default=0)
    reviews: Mapped[int] = mapped_column(Integer, default=0)
    badge: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_new: Mapped[bool] = mapped_column(default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Order(Base):
    __tablename__ = "orders"
    number: Mapped[str] = mapped_column(String(20), primary_key=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True,
                                                    index=True)
    ship_to: Mapped[dict] = mapped_column(JSON, default=dict)        # {name, line1, line2, city, region, zip, country}
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    shipping_cost: Mapped[float] = mapped_column(Float, default=0)
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_email: Mapped[str] = mapped_column(String(320), index=True)
    status: Mapped[str] = mapped_column(String(20))      # processing | shipped | delivered | cancelled
    items: Mapped[list] = mapped_column(JSON)             # [{name, size, qty, price}]
    total: Mapped[float] = mapped_column(Float)
    shipping_method: Mapped[str] = mapped_column(String(20), default="standard")
    carrier: Mapped[str] = mapped_column(String(40), default="")
    tracking: Mapped[str] = mapped_column(String(60), default="")
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    eta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
