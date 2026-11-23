import httpx

from helpdesk import hubspot
from helpdesk.tools import add_ticket_note, create_ticket, lookup_order, set_ticket_status


def test_order_lookup_only_for_its_owner(db):
    assert lookup_order(db, "1042", "sara@example.com")["found"]
    assert lookup_order(db, "1042", "SARA@example.com ")["found"]
    # someone else's order looks exactly like a missing one: no data leaks
    assert lookup_order(db, "1042", "mallory@example.com") == {"found": False, "order_number": "1042"}
    assert not lookup_order(db, "9999", "sara@example.com")["found"]


def test_ticket_numbers_and_notes(db):
    t = create_ticket(db, subject="Help", summary="s", category="other", priority="medium",
                      customer_email="a@example.com", conversation_id=None)
    assert t.number == 1000 + t.id
    set_ticket_status(t, "solved", "Ann")
    add_ticket_note(t, "done", "Ann")
    assert t.status == "solved" and len(t.notes) == 2
    db.rollback()


def test_hubspot_sync_create_then_update(db, monkeypatch):
    monkeypatch.setattr(hubspot, "get_settings", lambda: type("S", (), {"hubspot_token": "tok"})())
    calls = []

    def handler(req: httpx.Request):
        calls.append((req.method, req.url.path, req.headers["authorization"]))
        return httpx.Response(201 if req.method == "POST" else 200, json={"id": "777"})

    t = create_ticket(db, subject="Refund", summary="s", category="refund", priority="high",
                      customer_email="a@example.com", conversation_id=None)
    db.commit()
    client = httpx.Client(transport=httpx.MockTransport(handler))
    assert hubspot.sync_ticket(db, t.id, client) == "synced"
    assert t.hubspot_id == "777"
    assert hubspot.sync_ticket(db, t.id, client) == "synced"
    assert [c[0] for c in calls] == ["POST", "PATCH"] and calls[0][2] == "Bearer tok"


def test_hubspot_failure_does_not_break_the_app(db, monkeypatch):
    monkeypatch.setattr(hubspot, "get_settings", lambda: type("S", (), {"hubspot_token": "tok"})())
    t = create_ticket(db, subject="x", summary="s", category="other", priority="low",
                      customer_email="a@example.com", conversation_id=None)
    db.commit()
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, text="bad token")))
    assert hubspot.sync_ticket(db, t.id, client) == "failed"
    assert "bad token" in t.hubspot_error
