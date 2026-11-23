"""Tests run against a separate PostgreSQL database (helpdesk_test) and a FAKE LLM,
so they are fast, free and repeatable. The real model is tested by evals/run_evals.py."""

import os

os.environ["HELPDESK_DATABASE_URL"] = "postgresql+psycopg://helpdesk:helpdesk@127.0.0.1:5434/helpdesk_test"
os.environ["HELPDESK_HUBSPOT_TOKEN"] = ""
os.environ["HELPDESK_JWT_SECRET"] = "test-secret-test-secret-test-secret-123"

from datetime import datetime, timedelta, timezone  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from helpdesk import models  # noqa: E402
from helpdesk.agent.prompts import Analysis, GroundedAnswer, SuggestedReply, TicketDraft  # noqa: E402
from helpdesk.db import Base, SessionLocal, engine  # noqa: E402
from helpdesk.ingest import add_document  # noqa: E402

DOC = b"""# Returns Policy

## Return window
You can return most items within 30 days of delivery for a full refund.

## Footwear
Shoes can be returned within 30 days if they were worn indoors only.
"""


class FakeLLM:
    """Answers like a well-behaved model, driven by keywords in the message."""
    name = "fake"

    def __init__(self):
        self.answer = None   # tests can force a GroundedAnswer

    def json(self, system, user, schema, think=False):
        latest = user.split("Customer (latest):")[-1].split("Question to answer:")[-1].strip()
        if schema is Analysis:
            low = latest.lower()
            intent = "order_status" if "where is" in low else "question"
            return Analysis(intent=intent, mood="calm", refund_request="refund" in low, order_number=None,
                            standalone_question=latest)
        if schema is GroundedAnswer:
            if self.answer:
                return self.answer
            if "return" in latest.lower():
                q = "You can return most items within 30 days of delivery for a full refund."
                return GroundedAnswer(evidence=[{"source": 1, "quote": q}], answerable=True,
                                      answer="You can return most items within 30 days of delivery.")
            return GroundedAnswer(evidence=[], answerable=False, answer="")
        if schema is SuggestedReply:
            return SuggestedReply(reply="Hi Sara, thanks for waiting. – The Northwind team")
        if schema is TicketDraft:
            return TicketDraft(subject="Customer needs help", summary="Summary for the team.", category="other")
        raise AssertionError(schema)

    def stream(self, system, messages):
        yield "Your order is on its way."


@pytest.fixture(scope="session", autouse=True)
def database():
    with engine.begin() as c:
        c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        add_document(db, "returns.md", DOC)
        now = datetime.now(timezone.utc)
        db.add(models.Order(number="1042", customer_name="Sara", customer_email="sara@example.com",
                            status="shipped", items=[{"name": "Jacket", "size": "M", "qty": 1, "price": 100}],
                            total=100, carrier="USPS", tracking="US123", placed_at=now - timedelta(days=3),
                            shipped_at=now - timedelta(days=1), eta=now + timedelta(days=2)))
        db.commit()
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def fake_llm(monkeypatch):
    llm = FakeLLM()
    import helpdesk.chat as chat_mod
    monkeypatch.setattr(chat_mod, "get_llm", lambda: llm)
    import helpdesk.api.routes_admin as admin_mod
    monkeypatch.setattr(admin_mod, "get_llm", lambda: llm)
    return llm
