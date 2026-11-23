import json

from fastapi.testclient import TestClient

from helpdesk.api.main import app

client = TestClient(app)


def start_chat(c=client, email="sara@example.com"):
    r = c.post("/api/chat/start", json={"name": "Sara Ahmed", "email": email})
    assert r.status_code == 201
    return r.json()


def send(chat, text):
    r = client.post(f"/api/chat/{chat['id']}/messages", json={"text": text}, headers={"X-Chat-Token": chat["token"]})
    assert r.status_code == 200
    events = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    return events, events[-1]


def test_answer_with_source(fake_llm):
    chat = start_chat()
    events, done = send(chat, "How long do I have to return something?")
    assert done["type"] == "done"
    assert done["message"]["meta"]["route"] == "answer"
    assert "30 days" in done["message"]["content"]
    assert done["message"]["sources"][0]["document"] == "Returns Policy"
    assert any(e["type"] == "status" for e in events)


def test_not_in_docs_then_handoff_creates_ticket(fake_llm):
    chat = start_chat()
    _, done = send(chat, "Do you sell bicycles?")
    assert done["message"]["meta"]["route"] == "not_sure"
    _, done = send(chat, "yes please")
    assert done["message"]["meta"]["route"] == "handoff"
    assert done["conversation"]["status"] == "human"
    assert "ticket #" in done["message"]["content"]
    # after hand-off the assistant stays quiet
    _, done = send(chat, "hello?")
    assert done["message"] is None


def test_refund_goes_to_human_with_high_priority(fake_llm):
    chat = start_chat()
    _, done = send(chat, "I want a refund for my jacket")
    assert done["message"]["meta"]["route"] == "handoff"
    login()
    tickets = client.get("/api/admin/tickets").json()
    t = next(t for t in tickets if t["conversation_id"] == chat["id"])
    assert t["priority"] == "high" and t["category"] == "refund"


def test_order_status_uses_tool(fake_llm):
    chat = start_chat()
    _, done = send(chat, "where is order 1042")
    assert done["message"]["meta"]["route"] == "order"
    assert done["message"]["sources"][0]["heading"] == "Order 1042"


def test_chat_needs_its_token(fake_llm):
    chat = start_chat()
    assert client.get(f"/api/chat/{chat['id']}").status_code == 404
    assert client.get(f"/api/chat/{chat['id']}", headers={"X-Chat-Token": "wrong"}).status_code == 404
    assert client.get(f"/api/chat/{chat['id']}", headers={"X-Chat-Token": chat["token"]}).status_code == 200


def login():
    r = client.post("/api/auth/signup", json={"email": "agent@example.com", "password": "password123", "name": "Ann"})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"email": "agent@example.com", "password": "password123"})
    assert r.status_code in (200, 201)


def test_dashboard_needs_login():
    anon = TestClient(app)
    assert anon.get("/api/admin/conversations").status_code == 401
    assert anon.get("/api/admin/stats").status_code == 401


def test_human_reply_reaches_customer(fake_llm):
    chat = start_chat()
    send(chat, "Can I talk to a human?")
    login()
    r = client.post(f"/api/admin/conversations/{chat['id']}/reply", json={"text": "Hi Sara, Ann here."})
    assert r.status_code == 200
    msgs = client.get(f"/api/chat/{chat['id']}", headers={"X-Chat-Token": chat["token"]}).json()["messages"]
    assert msgs[-1]["role"] == "agent" and msgs[-1]["author"] == "Ann"
    tickets = [t for t in client.get("/api/admin/tickets").json() if t["conversation_id"] == chat["id"]]
    assert tickets[0]["status"] == "in_progress"


def test_upload_doc_and_stats(fake_llm):
    login()
    r = client.post("/api/admin/docs", files={"file": ("faq.md", b"# FAQ\n\n## Gift wrap\nWe offer free gift wrap.", "text/markdown")})
    assert r.status_code == 201 and r.json()["chunks"] == 1
    assert client.post("/api/admin/docs", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415
    s = client.get("/api/admin/stats").json()
    assert s["conversations"] >= 1 and "top_topics" in s


def test_order_card_data_and_feedback(fake_llm):
    chat = start_chat()
    _, done = send(chat, "where is order 1042")
    msg = done["message"]
    assert msg["meta"]["order"]["found"] and msg["meta"]["order"]["status"] == "shipped"
    h = {"X-Chat-Token": chat["token"]}
    r = client.post(f"/api/chat/{chat['id']}/messages/{msg['id']}/feedback", json={"value": "up"}, headers=h)
    assert r.status_code == 200 and r.json()["meta"]["feedback"] == "up"
    # someone else's token cannot vote
    assert client.post(f"/api/chat/{chat['id']}/messages/{msg['id']}/feedback", json={"value": "down"},
                       headers={"X-Chat-Token": "x"}).status_code == 404
    login()
    assert client.get("/api/admin/stats").json()["feedback"]["up"] >= 1


def test_inbox_shows_orders_and_suggests_reply(fake_llm):
    chat = start_chat()
    send(chat, "Can I talk to a human?")
    login()
    c = client.get(f"/api/admin/conversations/{chat['id']}").json()
    assert [o["number"] for o in c["orders"]] == ["1042"]
    r = client.post(f"/api/admin/conversations/{chat['id']}/suggest")
    assert r.status_code == 200 and "Northwind team" in r.json()["text"]
