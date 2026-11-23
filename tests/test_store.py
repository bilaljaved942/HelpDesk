from fastapi.testclient import TestClient

from helpdesk.api.main import app
from helpdesk.catalog import PRODUCTS
from helpdesk.db import SessionLocal
from helpdesk.models import Product


def _seed_products():
    with SessionLocal() as db:
        if not db.get(Product, PRODUCTS[0]["slug"]):
            db.add_all(Product(position=i, **p) for i, p in enumerate(PRODUCTS))
            db.commit()


def shopper(email="shopper@example.com"):
    _seed_products()
    c = TestClient(app)
    r = c.post("/api/store/auth/signup", json={"name": "Sam Shopper", "email": email, "password": "password123"})
    if r.status_code == 409:
        r = c.post("/api/store/auth/login", json={"email": email, "password": "password123"})
    assert r.status_code in (200, 201)
    return c


ADDRESS = {"name": "Sam Shopper", "line1": "1 Main St", "city": "Portland", "region": "OR", "zip": "97205",
           "country": "United States"}


def test_catalogue_filters():
    _seed_products()
    c = TestClient(app)
    assert len(c.get("/api/store/products").json()) == len(PRODUCTS)
    assert {p["category"] for p in c.get("/api/store/products?category=footwear").json()} == {"footwear"}
    assert all(p["compare_at"] for p in c.get("/api/store/products?sale=true").json())
    assert c.get("/api/store/products?q=boots").json()[0]["slug"] == "trailhead-hiking-boots"
    assert [p["slug"] for p in c.get("/api/store/products?q=tent").json()] == ["pine-two-person-tent"]
    assert c.get("/api/store/products?q=down jacket").json()[0]["slug"] == "summit-down-jacket"
    assert c.get("/api/store/products/nope").status_code == 404


def test_checkout_uses_server_prices_and_shipping_policy():
    c = shopper()
    item = {"slug": "basecamp-fleece", "size": "M", "color": "Clay", "qty": 1}          # $79
    r = c.post("/api/store/orders", json={"items": [item], "ship_to": ADDRESS, "method": "standard"})
    assert r.status_code == 201
    o = r.json()
    assert o["subtotal"] == 79.0 and o["shipping_cost"] == 0.0 and o["status"] == "processing"   # free over $75
    socks = {"slug": "merino-hiking-socks", "size": "M", "color": "Oat", "qty": 1}       # $34
    o2 = c.post("/api/store/orders", json={"items": [socks], "ship_to": ADDRESS, "method": "express"}).json()
    assert o2["shipping_cost"] == 14.95 and int(o2["number"]) > int(o["number"])
    assert [x["number"] for x in c.get("/api/store/orders").json()][:2] == [o2["number"], o["number"]]


def test_checkout_rejects_bad_items_and_needs_login():
    c = shopper()
    bad = {"slug": "basecamp-fleece", "size": "XXXL", "color": "Clay", "qty": 1}
    assert c.post("/api/store/orders", json={"items": [bad], "ship_to": ADDRESS, "method": "standard"}).status_code == 422
    anon = TestClient(app)
    ok = {"slug": "basecamp-fleece", "size": "M", "color": "Clay", "qty": 1}
    assert anon.post("/api/store/orders", json={"items": [ok], "ship_to": ADDRESS, "method": "standard"}).status_code == 401


def test_orders_are_private():
    a = shopper("a@example.com")
    item = {"slug": "basecamp-fleece", "size": "M", "color": "Clay", "qty": 1}
    num = a.post("/api/store/orders", json={"items": [item], "ship_to": ADDRESS, "method": "standard"}).json()["number"]
    b = shopper("b@example.com")
    assert b.get(f"/api/store/orders/{num}").status_code == 404
    assert num not in [o["number"] for o in b.get("/api/store/orders").json()]


def test_logged_in_shopper_chat_uses_account_email(fake_llm):
    c = shopper("chatter@example.com")
    r = c.post("/api/chat/start", json={"name": "Someone Else", "email": "other@example.com"})
    assert r.status_code == 201
    login = TestClient(app)
    login.post("/api/auth/signup", json={"email": "agent2@example.com", "password": "password123", "name": "A"})
    conv = login.get(f"/api/admin/conversations/{r.json()['id']}")
    # the start message counts as no customer message, so check through the DB instead
    from helpdesk.models import Conversation
    with SessionLocal() as db:
        assert db.get(Conversation, r.json()["id"]).customer_email == "chatter@example.com"
    assert conv.status_code in (200, 404)
