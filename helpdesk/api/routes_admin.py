"""Support dashboard (login required): docs, inbox, tickets, stats."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from helpdesk import chat
from helpdesk.api.routes_chat import sync_in_background
from helpdesk.api.security import current_user
from helpdesk.db import get_db
from helpdesk.ingest import SUPPORTED, add_document
from helpdesk.agent.prompts import SUGGEST_SYSTEM, SuggestedReply
from helpdesk.llm import get_llm
from helpdesk.models import Conversation, Document, Message, Order, Ticket, User
from helpdesk.search import search
from helpdesk.settings import get_settings
from helpdesk.tools import add_ticket_note, open_ticket_for, set_ticket_status

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_user)])


# ------------------------------------------------------------------ docs

def doc_out(d: Document) -> dict:
    return {"id": d.id, "title": d.title, "filename": d.filename, "chunks": d.n_chunks, "words": d.n_words,
            "created_at": d.created_at.isoformat()}


@router.get("/docs")
def list_docs(db: Session = Depends(get_db)):
    return [doc_out(d) for d in db.scalars(select(Document).order_by(Document.title))]


@router.post("/docs", status_code=201)
async def upload_doc(file: UploadFile = File(...), db: Session = Depends(get_db)):
    name = file.filename or "document.txt"
    if not any(name.lower().endswith(ext) for ext in SUPPORTED):
        raise HTTPException(415, f"Please upload one of: {', '.join(sorted(SUPPORTED))}.")
    data = await file.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    if len(data) > get_settings().max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is too large (max {get_settings().max_upload_mb} MB).")
    try:
        return doc_out(add_document(db, name, data))
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.delete("/docs/{doc_id}")
def delete_doc(doc_id: str, db: Session = Depends(get_db)):
    d = db.get(Document, doc_id)
    if not d:
        raise HTTPException(404, "Document not found.")
    db.delete(d)
    db.commit()
    return {"ok": True}


@router.get("/search")
def try_search(q: str, db: Session = Depends(get_db)):
    """See what the agent would find for a question (helps when editing docs)."""
    return [h.to_source() | {"label": h.label} for h in search(db, q, k=5)]


# ------------------------------------------------------------------ inbox

def ticket_out(t: Ticket) -> dict:
    return {"id": t.id, "number": t.number, "subject": t.subject, "summary": t.summary, "category": t.category,
            "priority": t.priority, "status": t.status, "customer_email": t.customer_email,
            "order_number": t.order_number, "notes": t.notes, "conversation_id": t.conversation_id,
            "hubspot": {"status": t.hubspot_status, "id": t.hubspot_id, "error": t.hubspot_error},
            "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat()}


def conv_summary(db: Session, c: Conversation) -> dict:
    last = db.scalar(select(Message).where(Message.conversation_id == c.id).order_by(Message.id.desc()).limit(1))
    n = db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == c.id,
                                                                  Message.role == "customer"))
    t = open_ticket_for(db, c.id)
    return {"id": c.id, "customer_name": c.customer_name, "customer_email": c.customer_email, "status": c.status,
            "resolution": c.resolution, "handoff_reason": c.handoff_reason, "customer_messages": n,
            "last_message": {"role": last.role, "content": last.content[:140]} if last else None,
            "waiting_for_team": bool(last and last.role == "customer" and c.status == "human")
            or bool(last and c.status == "human" and last.role == "ai"),
            "ticket": {"number": t.number, "priority": t.priority} if t else None,
            "created_at": c.created_at.isoformat(), "updated_at": c.updated_at.isoformat()}


@router.get("/conversations")
def list_conversations(status: str | None = None, db: Session = Depends(get_db)):
    q = select(Conversation).order_by(Conversation.updated_at.desc()).limit(200)
    if status:
        q = q.where(Conversation.status == status)
    items = [conv_summary(db, c) for c in db.scalars(q)
             if db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == c.id,
                                                                          Message.role == "customer"))]
    # needs a human first, then newest
    items.sort(key=lambda x: (not x["waiting_for_team"], x["status"] != "human"))
    return items


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: str, db: Session = Depends(get_db)):
    c = db.get(Conversation, conv_id)
    if not c:
        raise HTTPException(404, "Conversation not found.")
    tickets = db.scalars(select(Ticket).where(Ticket.conversation_id == c.id).order_by(Ticket.id)).all()
    msgs = [chat.message_out(m) | {"trace": (m.meta or {}) if m.role == "ai" else None} for m in c.messages]
    orders = db.scalars(select(Order).where(Order.customer_email == c.customer_email)
                        .order_by(Order.placed_at.desc()).limit(10)).all()
    return conv_summary(db, c) | {
        "messages": msgs,
        "tickets": [ticket_out(t) for t in tickets],
        "orders": [{"number": o.number, "status": o.status, "total": o.total, "placed_at": o.placed_at.isoformat(),
                    "items": [f"{i['qty']} × {i['name']} ({i['size']})" for i in o.items],
                    "tracking": o.tracking, "carrier": o.carrier} for o in orders],
    }


@router.post("/conversations/{conv_id}/suggest")
def suggest_reply(conv_id: str, db: Session = Depends(get_db)):
    """Draft a reply for the team member (they edit it before sending). Uses the chat, the
    help docs that match the customer's last message, and the customer's orders."""
    c = db.get(Conversation, conv_id)
    if not c:
        raise HTTPException(404, "Conversation not found.")
    msgs = [m for m in c.messages if m.meta.get("route") != "event"] if c.messages else []
    # What still needs an answer: the customer's messages after the last thing that was
    # resolved (an AI answer / order look-up, or a team reply). Earlier, solved topics are left
    # out, or the draft repeats them.
    last_done = max((i for i, m in enumerate(msgs)
                     if m.role == "agent" or (m.role == "ai" and m.meta.get("route") in ("answer", "order"))), default=-1)
    open_msgs = [m.content for m in msgs[last_done + 1:] if m.role == "customer"]
    issue = " / ".join(open_msgs) or c.handoff_reason or "(nothing open)"
    hits = search(db, " ".join(open_msgs)[:500], k=3) if open_msgs else []
    orders = db.scalars(select(Order).where(Order.customer_email == c.customer_email)).all()
    who = {"customer": "Customer", "ai": "AI assistant", "agent": "Support agent"}
    transcript = "\n".join(f"{who.get(m.role, m.role)}: {m.content}" for m in msgs[last_done + 1:][-10:])
    # only clearly relevant sections: a loosely related one ("Discount codes") invites made-up answers
    docs = "\n\n".join(f"[{h.label}]\n{h.text}" for h in hits if h.score > 0)
    if not docs:
        docs = ("NONE. No help doc covers this question, so do not answer it or state any rule at all "
                "(not even a likely one). Only thank the customer and say a team member is checking and will reply here.")
    order_lines = "\n".join(f"- Order {o.number}: {o.status}, ${o.total}, placed {o.placed_at:%b %d}"
                             + (f", tracking {o.carrier} {o.tracking}" if o.tracking else "") for o in orders) or "(none)"
    try:
        draft = get_llm().json(SUGGEST_SYSTEM.format(docs=docs, orders=order_lines),
                               f"Customer name: {c.customer_name}\n\nOpen issue to answer now: {issue}\n\n"
                               f"Chat:\n{transcript}", SuggestedReply)
    except Exception:
        raise HTTPException(503, "The AI model is not available right now.")
    return {"text": draft.reply.strip()}


class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post("/conversations/{conv_id}/reply")
def reply(conv_id: str, body: ReplyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """A team member writes to the customer. This also takes the chat over from the assistant."""
    c = db.get(Conversation, conv_id)
    if not c:
        raise HTTPException(404, "Conversation not found.")
    m = Message(conversation_id=c.id, role="agent", content=body.text.strip(), author=user.name or "Support team")
    db.add(m)
    c.status, c.assignee_id = "human", user.id
    c.updated_at = datetime.now(timezone.utc)
    t = open_ticket_for(db, c.id)
    if t and t.status == "open":
        set_ticket_status(t, "in_progress", user.name or user.email)
    db.commit()
    if t:
        sync_in_background([t.id])
    return chat.message_out(m)


class StatusIn(BaseModel):
    status: str = Field(pattern="^(ai|human|closed)$")


@router.post("/conversations/{conv_id}/status")
def set_status(conv_id: str, body: StatusIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """human = take over, ai = hand back to the assistant, closed = done."""
    c = db.get(Conversation, conv_id)
    if not c:
        raise HTTPException(404, "Conversation not found.")
    if body.status != c.status:
        text = {"human": f"{user.name or 'A team member'} joined the chat.",
                "ai": "The assistant is back in this chat.",
                "closed": "This chat was closed. Start a new chat any time."}[body.status]
        db.add(Message(conversation_id=c.id, role="agent" if body.status == "closed" else "ai",
                       content=text, author="", meta={"route": "event"}))
        if body.status == "closed" and c.handoff_reason:
            c.resolution = "human"
        if body.status == "ai":
            c.failures = 0
        c.status = body.status
        db.commit()
    return conv_summary(db, c)


# ------------------------------------------------------------------ tickets

@router.get("/tickets")
def list_tickets(status: str | None = None, db: Session = Depends(get_db)):
    q = select(Ticket).order_by(Ticket.id.desc()).limit(300)
    if status:
        q = q.where(Ticket.status == status)
    return [ticket_out(t) for t in db.scalars(q)]


class TicketUpdateIn(BaseModel):
    status: str | None = Field(default=None, pattern="^(open|in_progress|solved)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high)$")
    note: str | None = Field(default=None, max_length=4000)


@router.patch("/tickets/{ticket_id}")
def update_ticket(ticket_id: int, body: TicketUpdateIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    t = db.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found.")
    by = user.name or user.email
    if body.note:
        add_ticket_note(t, body.note.strip(), by)
    if body.priority and body.priority != t.priority:
        add_ticket_note(t, f"Priority: {t.priority} → {body.priority}", by)
        t.priority = body.priority
    if body.status:
        set_ticket_status(t, body.status, by)
        if body.status == "solved" and t.conversation_id:
            c = db.get(Conversation, t.conversation_id)
            if c:
                c.resolution = "human"
    db.commit()
    sync_in_background([t.id])
    return ticket_out(t)


@router.post("/tickets/{ticket_id}/sync")
def retry_sync(ticket_id: int, db: Session = Depends(get_db)):
    from helpdesk.hubspot import sync_ticket

    t = db.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket not found.")
    sync_ticket(db, t.id)
    return ticket_out(t)


# ------------------------------------------------------------------ stats

@router.get("/stats")
def stats(days: int = 7, db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    convs = [c for c in db.scalars(select(Conversation).where(Conversation.created_at >= since))
             if c.messages and any(m.role == "customer" for m in c.messages)]
    handed = [c for c in convs if c.handoff_reason]
    by_ai = [c for c in convs if not c.handoff_reason and c.resolution == "ai"]

    topics: Counter = Counter()
    routes: Counter = Counter()
    reasons: Counter = Counter(c.handoff_reason.split(";")[0] for c in handed)
    seconds = []
    votes: Counter = Counter()
    for c in convs:
        for m in c.messages:
            if m.role != "ai" or not m.meta or m.meta.get("route") in (None, "event"):
                continue
            if m.meta.get("feedback"):
                votes[m.meta["feedback"]] += 1
            routes[m.meta["route"]] += 1
            if m.meta.get("seconds"):
                seconds.append(m.meta["seconds"])
            for call in m.meta.get("tool_calls", []):
                if call["tool"] == "search_docs" and call.get("top") and m.meta["route"] == "answer":
                    topics[call["top"][0]["label"]] += 1
                elif call["tool"] == "lookup_order":
                    topics["Order status"] += 1

    daily = []
    for i in range(days - 1, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date()
        day = [c for c in convs if c.created_at.date() == d]
        daily.append({"date": d.isoformat(), "conversations": len(day),
                      "handed_off": sum(1 for c in day if c.handoff_reason)})

    tickets = db.scalars(select(Ticket).where(Ticket.created_at >= since)).all()
    return {
        "days": days,
        "conversations": len(convs),
        "resolved_by_ai": len(by_ai),
        "handed_off": len(handed),
        "ai_resolution_rate": round(len(by_ai) / len(convs), 3) if convs else 0,
        "open_tickets": db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status != "solved")),
        "tickets_created": len(tickets),
        "avg_reply_seconds": round(sum(seconds) / len(seconds), 1) if seconds else None,
        "feedback": {"up": votes["up"], "down": votes["down"]},
        "top_topics": [{"topic": k, "count": v} for k, v in topics.most_common(8)],
        "handoff_reasons": [{"reason": k, "count": v} for k, v in reasons.most_common(6)],
        "replies_by_route": dict(routes),
        "daily": daily,
    }
