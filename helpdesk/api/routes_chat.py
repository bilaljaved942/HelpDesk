"""Customer chat (public: no account needed).

Starting a chat returns a random token; every later call must send it in the
X-Chat-Token header, so nobody can read someone else's conversation by guessing ids.
The agent's answer streams as Server-Sent Events (one JSON event per line).
"""

import json
import secrets
import threading

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpdesk import chat
from helpdesk.db import SessionLocal, get_db
from helpdesk.api.routes_store import customer_from_request
from helpdesk.hubspot import sync_ticket
from helpdesk.models import Conversation, Message

router = APIRouter(prefix="/api/chat", tags=["chat"])


class StartIn(BaseModel):
    # not needed when the shopper is logged in to the store: their account is used instead
    name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None


class SendIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class FeedbackIn(BaseModel):
    value: str = Field(pattern="^(up|down|none)$")


def _conversation(db: Session, conv_id: str, token: str | None) -> Conversation:
    c = db.get(Conversation, conv_id)
    if not c or not token or not secrets.compare_digest(c.token, token):
        raise HTTPException(404, "Chat not found.")
    return c


def sync_in_background(ticket_ids: list[int]) -> None:
    def run():
        with SessionLocal() as db:
            for tid in ticket_ids:
                sync_ticket(db, tid)
    if ticket_ids:
        threading.Thread(target=run, daemon=True).start()


@router.post("/start", status_code=201)
def start(body: StartIn, request: Request, db: Session = Depends(get_db)):
    customer = customer_from_request(request, db)
    if customer:
        # logged-in shopper: the email is verified by their login, so order look-ups are safe
        name, email = customer.name or customer.email.split("@")[0], customer.email
    elif body.name and body.name.strip() and body.email:
        name, email = body.name, str(body.email)
    else:
        raise HTTPException(422, "Please enter your name and email.")
    c = chat.start(db, name, email)
    return {"id": c.id, "token": c.token, "status": c.status,
            "messages": [chat.message_out(m) for m in c.messages]}


@router.get("/{conv_id}")
def get_chat(conv_id: str, after: int = 0, x_chat_token: str | None = Header(None),
             db: Session = Depends(get_db)):
    """The chat so far (or only messages newer than `after`, for polling)."""
    c = _conversation(db, conv_id, x_chat_token)
    rows = db.scalars(select(Message).where(Message.conversation_id == c.id, Message.id > after,
                                            Message.role != "system").order_by(Message.id)).all()
    return {"id": c.id, "status": c.status, "customer_name": c.customer_name,
            "messages": [chat.message_out(m) for m in rows]}


@router.post("/{conv_id}/messages")
def send(conv_id: str, body: SendIn, x_chat_token: str | None = Header(None)):
    with SessionLocal() as db:
        _conversation(db, conv_id, x_chat_token)      # check before streaming starts

    def events():
        # own DB session: it must live as long as the stream, not just the request handler
        with SessionLocal() as db:
            c = db.get(Conversation, conv_id)
            try:
                for ev in chat.run_turn(db, c, body.text):
                    if ev["type"] == "done":
                        sync_in_background(ev.pop("ticket_ids", []))
                    yield f"data: {json.dumps(ev)}\n\n"
            except Exception as e:  # e.g. Ollama not running
                db.rollback()
                msg = ("The assistant is offline right now. Please try again in a minute."
                       if "connect" in str(e).lower() else "Sorry, something went wrong. Please try again.")
                yield f"data: {json.dumps({'type': 'error', 'text': msg})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/{conv_id}/messages/{message_id}/feedback")
def feedback(conv_id: str, message_id: int, body: FeedbackIn, x_chat_token: str | None = Header(None),
             db: Session = Depends(get_db)):
    """Customer's thumbs up / down on an AI answer (shown in the dashboard stats)."""
    c = _conversation(db, conv_id, x_chat_token)
    m = db.get(Message, message_id)
    if not m or m.conversation_id != c.id or m.role != "ai":
        raise HTTPException(404, "Message not found.")
    meta = dict(m.meta or {})
    if body.value == "none":
        meta.pop("feedback", None)
    else:
        meta["feedback"] = body.value
    m.meta = meta
    db.commit()
    return chat.message_out(m)
