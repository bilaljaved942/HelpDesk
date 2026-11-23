"""One chat turn: save the customer's message, run the agent, save its reply.

Used by the API (streamed to the browser) and by the eval runner (collected).
Yields events:
  {"type": "status", "text": ...}     progress ("Searching the help docs…")
  {"type": "token",  "text": ...}     answer text as it is written
  {"type": "reset"}                   discard streamed text (the reply changed)
  {"type": "done",   "message": {...}, "conversation": {...}}
"""

import time
from collections.abc import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from helpdesk.agent.graph import GRAPH
from helpdesk.llm import get_llm
from helpdesk.models import Conversation, Message, Ticket


def message_out(m: Message) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "author": m.author, "sources": m.sources,
            "meta": {k: v for k, v in (m.meta or {}).items()
                     if k in ("route", "ticket_number", "order", "offered_handoff", "feedback")},
            "created_at": m.created_at.isoformat()}


def conversation_out(c: Conversation) -> dict:
    return {"id": c.id, "status": c.status, "customer_name": c.customer_name}


def start(db: Session, name: str, email: str) -> Conversation:
    c = Conversation(customer_name=name.strip(), customer_email=email.strip().lower())
    db.add(c)
    db.flush()
    first = name.strip().split(" ")[0]
    db.add(Message(conversation_id=c.id, role="ai",
                   content=f"Hi {first}! 👋 What can I help you with today?"))
    db.commit()
    return c


def _history(db: Session, c: Conversation, before_id: int) -> list[dict]:
    rows = db.scalars(select(Message).where(Message.conversation_id == c.id, Message.id < before_id,
                                            Message.role != "system").order_by(Message.id)).all()
    return [{"role": m.role, "content": m.content, "meta": m.meta or {}} for m in rows]


def run_turn(db: Session, c: Conversation, text: str, llm=None) -> Iterator[dict]:
    text = text.strip()[:2000]
    msg = Message(conversation_id=c.id, role="customer", content=text)
    db.add(msg)
    db.commit()

    # A human has taken over: the assistant stays quiet; the team sees the message in the inbox.
    if c.status != "ai":
        c.updated_at = msg.created_at
        db.commit()
        yield {"type": "done", "message": None, "conversation": conversation_out(c)}
        return

    history = _history(db, c, msg.id)
    last_ai = next((m for m in reversed(history) if m["role"] == "ai"), None)
    state = {
        "conversation_id": c.id,
        "customer_name": c.customer_name,
        "customer_email": c.customer_email,
        "message": text,
        "history": [{"role": m["role"], "content": m["content"], "route": m["meta"].get("route")} for m in history],
        "offered_handoff": bool(last_ai and last_ai["meta"].get("offered_handoff")),
        "failures": c.failures,
    }
    config = {"configurable": {"db": db, "llm": llm or get_llm()}}

    t0 = time.monotonic()
    final: dict = {}
    for mode, data in GRAPH.stream(state, config, stream_mode=["custom", "values"]):
        if mode == "custom":
            yield data
        else:
            final = data

    reply = final.get("reply") or "Sorry, something went wrong on my side. Please try again."
    route = final.get("route", "error")
    ai = Message(conversation_id=c.id, role="ai", content=reply, sources=final.get("sources", []), meta={
        "route": route,
        "analysis": final.get("analysis"),
        "tool_calls": final.get("tool_calls", []),
        "check": final.get("check"),
        "order": final.get("order"),
        "offered_handoff": final.get("offered_handoff", False),
        "handoff_reason": final.get("handoff_reason", ""),
        "ticket_number": final.get("ticket_number"),
        "seconds": round(time.monotonic() - t0, 2),
        "model": getattr(llm or get_llm(), "name", "?"),
    })
    db.add(ai)
    c.failures = final.get("failures", c.failures)
    if route == "handoff":
        c.status = "human"
        c.handoff_reason = final.get("handoff_reason", "")
    elif route in ("answer", "order") and not c.resolution:
        c.resolution = "ai"
    db.commit()
    yield {"type": "done", "message": message_out(ai), "conversation": conversation_out(c),
           "ticket_ids": [t.id for t in db.scalars(select(Ticket).where(Ticket.conversation_id == c.id,
                                                                         Ticket.hubspot_status == "pending"))]}
