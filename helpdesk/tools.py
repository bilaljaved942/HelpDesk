"""The agent's tools: things it can DO, not just say.

  lookup_order     read an order (only if it belongs to the customer's email)
  create_ticket    open a ticket for the human team
  add_ticket_note  add information to a customer's open ticket
  set_ticket_status  used by the dashboard (open / in_progress / solved)

Every ticket change marks the ticket for HubSpot sync (see hubspot.py).
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from helpdesk.models import Order, Ticket
from helpdesk.settings import get_settings

TICKET_STATUSES = ("open", "in_progress", "solved")
STATUS_LABEL = {"open": "Open", "in_progress": "In progress", "solved": "Solved"}


def _fmt(d: datetime | None) -> str | None:
    return d.strftime("%A, %b %d, %Y") if d else None


def lookup_order(db: Session, number: str, customer_email: str) -> dict:
    """Facts about one order, for the model to phrase. Privacy: an order is only shown to the
    email it was placed with, and a wrong email gets the same answer as a missing order."""
    order = db.get(Order, number.strip().lstrip("#"))
    if not order or order.customer_email.lower() != customer_email.lower().strip():
        return {"found": False, "order_number": number}
    return {
        "found": True,
        "order_number": order.number,
        "status": order.status,
        "items": [f"{i['qty']} x {i['name']} ({i['size']})" for i in order.items],
        "total_usd": order.total,
        "shipping_method": order.shipping_method,
        "placed": _fmt(order.placed_at),
        "shipped": _fmt(order.shipped_at),
        "delivered": _fmt(order.delivered_at),
        "estimated_delivery": None if order.delivered_at else _fmt(order.eta),
        "carrier": order.carrier or None,
        "tracking_number": order.tracking or None,
    }


def _mark_for_sync(t: Ticket) -> None:
    t.hubspot_status = "pending" if get_settings().hubspot_token else "off"


def create_ticket(db: Session, *, subject: str, summary: str, category: str, priority: str,
                  customer_email: str, conversation_id: str | None, order_number: str = "") -> Ticket:
    t = Ticket(subject=subject[:200], summary=summary, category=category, priority=priority,
               customer_email=customer_email, conversation_id=conversation_id, order_number=order_number or "",
               number=0, notes=[])
    db.add(t)
    db.flush()                 # gets the id
    t.number = 1000 + t.id     # people see #1001, #1002, ...
    _mark_for_sync(t)
    return t


def add_ticket_note(t: Ticket, text: str, by: str) -> None:
    t.notes = [*t.notes, {"at": datetime.now(timezone.utc).isoformat(), "by": by, "text": text}]
    _mark_for_sync(t)


def set_ticket_status(t: Ticket, status: str, by: str) -> None:
    if status not in TICKET_STATUSES:
        raise ValueError(f"status must be one of {TICKET_STATUSES}")
    if status != t.status:
        add_ticket_note(t, f"Status: {STATUS_LABEL[t.status]} → {STATUS_LABEL[status]}", by)
        t.status = status


def open_ticket_for(db: Session, conversation_id: str) -> Ticket | None:
    return db.scalar(select(Ticket).where(Ticket.conversation_id == conversation_id, Ticket.status != "solved")
                     .order_by(Ticket.id.desc()))
