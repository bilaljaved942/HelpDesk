"""The demo shop: products, help pages, customer accounts and orders.

Shoppers have their own accounts (table `customers`, cookie `northwind_session`), separate from
the support team's logins. Orders placed here are real rows in `orders`, so the support agent
can look them up in the chat.
"""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from helpdesk.api.security import hash_password, verify_password
from helpdesk.catalog import CATEGORIES, INTERNATIONAL, SHIPPING, shipping_cost
from helpdesk.db import get_db
from helpdesk.models import Customer, Document, Order, Product
from helpdesk.settings import get_settings

router = APIRouter(prefix="/api/store", tags=["store"])
COOKIE = "northwind_session"
COUNTRIES = ["United States", *sorted(INTERNATIONAL)]


# ------------------------------------------------------------------ customer sessions

def set_customer_session(response: Response, c: Customer) -> None:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(days=30)
    token = jwt.encode({"sub": c.id, "typ": "customer", "exp": exp}, s.jwt_secret, algorithm="HS256")
    response.set_cookie(COOKIE, token, max_age=30 * 86400, httponly=True, secure=s.cookie_secure,
                        samesite="lax", path="/")


def customer_from_request(request: Request, db: Session) -> Customer | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != "customer":
        return None
    return db.get(Customer, claims["sub"])


def current_customer(request: Request, db: Session = Depends(get_db)) -> Customer:
    c = customer_from_request(request, db)
    if not c:
        raise HTTPException(401, "Please log in to your account.")
    return c


def customer_out(c: Customer) -> dict:
    return {"id": c.id, "email": c.email, "name": c.name}


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


@router.post("/auth/signup", status_code=201)
def signup(body: SignupIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(Customer).where(Customer.email == email)):
        raise HTTPException(409, "You already have an account with this email. Log in instead.")
    c = Customer(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(c)
    db.commit()
    # orders placed earlier with this email (e.g. by phone) now show in the account
    for o in db.scalars(select(Order).where(Order.customer_email == email, Order.customer_id.is_(None))):
        o.customer_id = c.id
    db.commit()
    set_customer_session(response, c)
    return customer_out(c)


@router.post("/auth/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    c = db.scalar(select(Customer).where(Customer.email == body.email.lower().strip()))
    if not verify_password(body.password, c.password_hash if c else None):
        raise HTTPException(401, "Wrong email or password.")
    set_customer_session(response, c)
    return customer_out(c)


@router.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(c: Customer = Depends(current_customer)):
    return customer_out(c)


# ------------------------------------------------------------------ catalogue

def product_out(p: Product) -> dict:
    return {"slug": p.slug, "name": p.name, "category": p.category, "category_name": CATEGORIES.get(p.category, ""),
            "price": p.price, "compare_at": p.compare_at, "description": p.description, "features": p.features,
            "sizes": p.sizes, "colors": p.colors, "art": p.art, "bg": p.bg, "rating": p.rating,
            "reviews": p.reviews, "badge": p.badge, "is_new": p.is_new}


@router.get("/products")
def products(category: str | None = None, q: str | None = None, sale: bool = False, new: bool = False,
             db: Session = Depends(get_db)):
    query = select(Product).order_by(Product.position)
    if category:
        query = query.where(Product.category == category)
    if sale:
        query = query.where(Product.compare_at.is_not(None))
    if new:
        query = query.where(Product.is_new.is_(True))
    if q and q.strip():
        # every word must start a word somewhere in the product ("tent" must not match "content")
        for word in q.strip().split()[:5]:
            pattern = r"\m" + re.escape(word.lower())
            query = query.where(or_(*(col.regexp_match(pattern, flags="i")
                                      for col in (Product.name, Product.description, Product.category))))
    return [product_out(p) for p in db.scalars(query)]


@router.get("/products/{slug}")
def product(slug: str, db: Session = Depends(get_db)):
    p = db.get(Product, slug)
    if not p:
        raise HTTPException(404, "Product not found.")
    related = db.scalars(select(Product).where(Product.slug != slug).order_by(
        (Product.category != p.category), Product.position).limit(3)).all()
    return product_out(p) | {"related": [product_out(r) for r in related]}


@router.get("/meta")
def meta():
    return {"categories": CATEGORIES, "shipping": SHIPPING, "free_over": 75.0, "countries": COUNTRIES,
            "international_price": 24.95}


# ------------------------------------------------------------------ help center (same docs the AI uses)

def _slug(d: Document) -> str:
    return Path(d.filename).stem.lower().replace(" ", "-")


@router.get("/help")
def help_pages(db: Session = Depends(get_db)):
    return [{"slug": _slug(d), "title": d.title} for d in db.scalars(select(Document).order_by(Document.title))]


@router.get("/help/{slug}")
def help_page(slug: str, db: Session = Depends(get_db)):
    for d in db.scalars(select(Document)):
        if _slug(d) == slug:
            return {"slug": slug, "title": d.title, "content": d.content, "updated_at": d.created_at.isoformat()}
    raise HTTPException(404, "Help page not found.")


# ------------------------------------------------------------------ orders

class CartItem(BaseModel):
    slug: str
    size: str
    color: str
    qty: int = Field(ge=1, le=10)


class Address(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    line1: str = Field(min_length=1, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(default="", max_length=100)
    zip: str = Field(min_length=2, max_length=20)
    country: str


class OrderIn(BaseModel):
    items: list[CartItem] = Field(min_length=1, max_length=20)
    ship_to: Address
    method: str


def order_out(o: Order) -> dict:
    return {"number": o.number, "status": o.status, "items": o.items, "subtotal": o.subtotal,
            "shipping_cost": o.shipping_cost, "total": o.total, "shipping_method": o.shipping_method,
            "ship_to": o.ship_to, "carrier": o.carrier, "tracking": o.tracking,
            "placed_at": o.placed_at.isoformat(),
            "shipped_at": o.shipped_at.isoformat() if o.shipped_at else None,
            "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            "eta": o.eta.isoformat() if o.eta else None}


def _next_number(db: Session) -> str:
    top = db.scalar(select(func.max(cast(Order.number, Integer))))
    return str(max(int(top or 1000), 1200) + 1)


@router.post("/orders", status_code=201)
def place_order(body: OrderIn, c: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    """Check the cart against the catalogue (prices come from the server, never the browser),
    work out shipping from the shipping policy and create the order. No payment in this demo."""
    if body.method not in SHIPPING:
        raise HTTPException(422, "Please choose a shipping option.")
    if body.ship_to.country not in COUNTRIES:
        raise HTTPException(422, "Sorry, we don't ship to that country yet.")
    lines, subtotal = [], 0.0
    for it in body.items:
        p = db.get(Product, it.slug)
        if not p:
            raise HTTPException(422, "An item in your cart is no longer available.")
        if it.size not in p.sizes or it.color not in [col["name"] for col in p.colors]:
            raise HTTPException(422, f"Please choose a valid size and colour for {p.name}.")
        lines.append({"slug": p.slug, "name": p.name, "size": it.size, "color": it.color, "qty": it.qty,
                      "price": p.price})
        subtotal += p.price * it.qty
    subtotal = round(subtotal, 2)
    international = body.ship_to.country != "United States"
    method = "standard" if international else body.method
    ship = shipping_cost(method, subtotal, body.ship_to.country)
    now = datetime.now(timezone.utc)
    days = 14 if international else SHIPPING[method]["days"]

    for _ in range(3):   # two checkouts at the same moment could pick the same number: retry
        o = Order(number=_next_number(db), customer_id=c.id, customer_name=body.ship_to.name.strip(),
                  customer_email=c.email, status="processing", items=lines, subtotal=subtotal,
                  shipping_cost=ship, total=round(subtotal + ship, 2), shipping_method=method,
                  ship_to=body.ship_to.model_dump(), placed_at=now, eta=now + timedelta(days=days + 1))
        db.add(o)
        try:
            db.commit()
            return order_out(o)
        except IntegrityError:
            db.rollback()
    raise HTTPException(503, "Please try again.")


@router.get("/orders")
def my_orders(c: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    rows = db.scalars(select(Order).where((Order.customer_id == c.id) | (Order.customer_email == c.email))
                      .order_by(Order.placed_at.desc())).all()
    return [order_out(o) for o in rows]


@router.get("/orders/{number}")
def my_order(number: str, c: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    o = db.get(Order, number)
    if not o or (o.customer_id != c.id and o.customer_email != c.email):
        raise HTTPException(404, "Order not found.")
    return order_out(o)
