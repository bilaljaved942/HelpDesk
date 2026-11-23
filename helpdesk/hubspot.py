"""Copy tickets to HubSpot (optional).

Our database is the source of truth; HubSpot gets a copy so a team that already works in
HubSpot sees every ticket there. If no token is set, or HubSpot is down, the app keeps
working and the ticket shows "not synced" in the dashboard (it can be retried).

Setup: HubSpot > Settings > Integrations > Private Apps > create app with scopes
"tickets" (read + write) -> copy the token into HELPDESK_HUBSPOT_TOKEN.
"""

import logging

import httpx
from sqlalchemy.orm import Session

from helpdesk.models import Ticket
from helpdesk.settings import get_settings

log = logging.getLogger(__name__)
API = "https://api.hubapi.com/crm/v3/objects/tickets"

# HubSpot's default "Support Pipeline" (id "0") stage ids
STAGE = {"open": "1", "in_progress": "3", "solved": "4"}      # New / Waiting on us / Closed
PRIORITY = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH"}


def _properties(t: Ticket) -> dict:
    notes = "\n".join(f"- {n['by']}: {n['text']}" for n in t.notes)
    content = (f"{t.summary}\n\nCustomer: {t.customer_email}\nOrder: {t.order_number or '-'}\n"
               f"Category: {t.category}\nOur ticket: #{t.number}" + (f"\n\nNotes:\n{notes}" if notes else ""))
    return {
        "subject": f"#{t.number} {t.subject}",
        "content": content[:65000],
        "hs_pipeline": "0",
        "hs_pipeline_stage": STAGE.get(t.status, "1"),
        "hs_ticket_priority": PRIORITY.get(t.priority, "MEDIUM"),
    }


def sync_ticket(db: Session, ticket_id: int, client: httpx.Client | None = None) -> str:
    """Create or update the ticket in HubSpot. Returns the new hubspot_status."""
    t = db.get(Ticket, ticket_id)
    token = get_settings().hubspot_token
    if not t:
        return "missing"
    if not token:
        t.hubspot_status = "off"
        db.commit()
        return t.hubspot_status
    own = client is None
    client = client or httpx.Client(timeout=15)
    try:
        headers = {"Authorization": f"Bearer {token}"}
        if t.hubspot_id:
            r = client.patch(f"{API}/{t.hubspot_id}", json={"properties": _properties(t)}, headers=headers)
        else:
            r = client.post(API, json={"properties": _properties(t)}, headers=headers)
        r.raise_for_status()
        t.hubspot_id = str(r.json()["id"])
        t.hubspot_status, t.hubspot_error = "synced", ""
    except Exception as e:   # network error, bad token, HubSpot down...
        detail = e.response.text[:200] if isinstance(e, httpx.HTTPStatusError) else str(e)[:200]
        log.warning("HubSpot sync failed for ticket #%s: %s", t.number, detail)
        t.hubspot_status, t.hubspot_error = "failed", detail
    finally:
        if own:
            client.close()
    db.commit()
    return t.hubspot_status
