"""HelpDesk Agent API.

    uvicorn helpdesk.api.main:app --port 8100

Public:   /api/chat/*   customer chat (token per conversation)
          /api/store/*  the demo shop: products, help pages, customer accounts, orders
Login:    /api/admin/*  support dashboard (docs, inbox, tickets, stats)
          /api/auth/*   sign up / log in for the support team
"""

import logging

from fastapi import FastAPI
from sqlalchemy import text

from helpdesk.api import routes_admin, routes_auth, routes_chat, routes_store
from helpdesk.db import engine
from helpdesk.llm import get_llm
from helpdesk.settings import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="HelpDesk Agent API", version="1.0")
app.include_router(routes_auth.router)
app.include_router(routes_chat.router)
app.include_router(routes_admin.router)
app.include_router(routes_store.router)


@app.get("/api/health")
def health():
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
        db_ok = True
    except Exception:
        db_ok = False
    llm = get_llm()
    return {"ok": db_ok, "llm": llm.is_up(), "model": llm.name, "hubspot": bool(get_settings().hubspot_token)}
