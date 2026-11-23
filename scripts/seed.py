"""Fill the database with the demo store: products, help docs, ~30 orders, a demo customer and a team login.

    python scripts/seed.py            # add what is missing
    python scripts/seed.py --reset    # delete docs, orders and chats first

All data is invented (Northwind Outfitters is not a real company).
Orders are dated relative to today, so "shipped 2 days ago" stays true whenever you run it.
"""

import argparse
import random
import zlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select  # noqa: E402

from helpdesk.api.security import hash_password  # noqa: E402
from helpdesk.db import SessionLocal  # noqa: E402
from helpdesk.ingest import add_document  # noqa: E402
from helpdesk.catalog import BY_SLUG, SHIPPING, shipping_cost  # noqa: E402
from helpdesk.catalog import PRODUCTS as CATALOG  # noqa: E402
from helpdesk.models import Conversation, Customer, Document, Order, Product, Ticket, User  # noqa: E402

DOCS = ROOT / "seed" / "docs"
ADMIN_EMAIL = "admin@northwind.example"
ADMIN_PASSWORD = "northwind-demo"

# Old index -> catalogue product (keeps the demo orders below short to read)
P = [BY_SLUG[slug] for slug in (
    "ridgeline-waterproof-jacket", "summit-down-jacket", "trailhead-hiking-boots", "swift-trail-runners",
    "basecamp-fleece", "canyon-hiking-trousers", "merino-hiking-socks", "alpine-30l-backpack", "pine-two-person-tent")]
DEMO_CUSTOMER = ("Sara Ahmed", "sara@example.com", "sara-demo-1")   # store login for the demo
CITIES = [("Portland", "OR", "97205"), ("Seattle", "WA", "98101"), ("Denver", "CO", "80202"), ("Austin", "TX", "78701"),
          ("Boston", "MA", "02108"), ("Chicago", "IL", "60601"), ("San Diego", "CA", "92101")]
NAMES = ["Liam Carter", "Olivia Brooks", "Noah Patel", "Emma Nguyen", "Ava Johnson", "Mason Rivera", "Mia Chen",
         "Lucas Kim", "Amelia Garcia", "Ethan Wright", "Harper Lewis", "James Murphy", "Ella Rossi", "Henry Adams"]

# Orders the demo script talks about. Days are relative to today.
DEMO_ORDERS = [
    # number, name, email, status, items, method, placed, shipped, delivered, eta
    ("1042", "Sara Ahmed", "sara@example.com", "shipped", [(0, "M", 1), (6, "M", 1)], "standard", -4, -2, None, 2),
    ("1043", "Sara Ahmed", "sara@example.com", "delivered", [(2, "9.5", 1)], "express", -20, -19, -17, None),
    ("1044", "Sara Ahmed", "sara@example.com", "processing", [(4, "S", 2)], "standard", 0, None, None, 6),
    ("1050", "David Okafor", "david@example.com", "shipped", [(8, "One size", 1)], "standard", -14, -12, None, -4),
]


def money(items):
    return round(sum(P[i]["price"] * q for i, _, q in items), 2)


def make_orders(today: datetime) -> list[Order]:
    def day(n):
        return None if n is None else today + timedelta(days=n)

    out = []
    for num, name, email, status, items, method, placed, shipped, delivered, eta in DEMO_ORDERS:
        out.append(_order(num, name, email, status, items, method, day(placed), day(shipped), day(delivered), day(eta)))

    rnd = random.Random(7)
    for i in range(26):
        num = str(1060 + i * 3)
        name = rnd.choice(NAMES)
        email = name.split()[0].lower() + "@example.com"
        items = [(p, rnd.choice(P[p]["sizes"]), rnd.choice([1, 1, 2]))
                 for p in rnd.sample(range(len(P)), rnd.choice([1, 1, 2, 3]))]
        method = rnd.choice(["standard", "standard", "express", "next-day"])
        placed = -rnd.randint(0, 40)
        if placed > -2:
            status, shipped, delivered, eta = "processing", None, None, placed + 6
        elif placed > -6:
            status, shipped, delivered, eta = "shipped", placed + 1, None, placed + 6
        else:
            status, shipped, delivered, eta = "delivered", placed + 1, placed + 5, None
        out.append(_order(num, name, email, status, items, method, day(placed), day(shipped), day(delivered),
                          day(eta)))
    return out


def _order(num, name, email, status, items, method, placed, shipped, delivered, eta) -> Order:
    carrier = SHIPPING[method]["carrier"]
    subtotal = money(items)
    ship = shipping_cost(method, subtotal, "United States")
    city, region, zip_code = CITIES[zlib.crc32(num.encode()) % len(CITIES)]
    return Order(
        number=num, customer_name=name, customer_email=email, status=status,
        items=[{"slug": P[i]["slug"], "name": P[i]["name"], "size": size, "color": P[i]["colors"][0]["name"],
                "qty": q, "price": P[i]["price"]} for i, size, q in items],
        subtotal=subtotal, shipping_cost=ship, total=round(subtotal + ship, 2),
        ship_to={"name": name, "line1": f"{100 + zlib.crc32(email.encode()) % 900} Cedar Street", "line2": "",
                 "city": city, "region": region, "zip": zip_code, "country": "United States"},
        shipping_method=method, carrier=carrier if shipped else "",
        tracking=f"{carrier[:2].upper()}{zlib.crc32(num.encode()) % 10**10:010d}" if shipped else "",
        placed_at=placed, shipped_at=shipped, delivered_at=delivered, eta=eta)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--reset", action="store_true", help="delete docs, orders, chats and tickets first")
    args = p.parse_args()
    today = datetime.now(timezone.utc).replace(hour=15, minute=0, second=0, microsecond=0)

    with SessionLocal() as db:
        if args.reset:
            for model in (Ticket, Conversation, Document, Order, Customer):
                db.execute(delete(model))
            db.commit()

        # catalogue: always refreshed from helpdesk/catalog.py
        db.execute(delete(Product))
        db.add_all(Product(position=i, **{k: v for k, v in p.items()}) for i, p in enumerate(CATALOG))
        db.commit()
        print(f"products {len(CATALOG)}")

        sara = db.scalar(select(Customer).where(Customer.email == DEMO_CUSTOMER[1]))
        if not sara:
            sara = Customer(name=DEMO_CUSTOMER[0], email=DEMO_CUSTOMER[1], password_hash=hash_password(DEMO_CUSTOMER[2]))
            db.add(sara)
            db.commit()
            print(f"store login {DEMO_CUSTOMER[1]} / {DEMO_CUSTOMER[2]}")

        have = set(db.scalars(select(Document.filename)))
        for path in sorted(DOCS.glob("*.md")):
            if path.name not in have:
                doc = add_document(db, path.name, path.read_bytes())
                print(f"doc   {doc.title:<35} {doc.n_chunks} pieces")

        if not db.scalar(select(Order).limit(1)):
            orders = make_orders(today)
            for o in orders:
                if o.customer_email == sara.email:
                    o.customer_id = sara.id
            db.add_all(orders)
            db.commit()
            print(f"orders {len(orders)} (demo: 1042, 1043, 1044 for sara@example.com; 1050 is late)")

        if not db.scalar(select(User).where(User.email == ADMIN_EMAIL)):
            db.add(User(email=ADMIN_EMAIL, name="Support Team", password_hash=hash_password(ADMIN_PASSWORD)))
            db.commit()
            print(f"login {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    main()
