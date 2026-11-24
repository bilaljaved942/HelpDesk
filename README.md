# HelpDesk Agent: AI Customer Support with Actions

A working online store (**Northwind Outfitters**) with an AI support agent built in. It **answers only from the business's help docs (with sources)**,
**looks up orders**, **creates tickets**, and **hands the chat to a human** when it should.
The support team gets a dashboard: inbox with live human replies, tickets (synced to HubSpot) and stats.

Runs fully **local and free**: the LLM is Qwen3 8B through Ollama. No paid APIs.

## Features

**The store (a real, working shop)**
- Categories, search, sorting, product pages with colour / size / quantity
- Cart (saved in the browser) with a free-shipping progress bar
- Customer accounts: sign up, log in, order history, order tracking page, saved items (♡)
- Checkout that creates a real order (shipping prices from the shipping policy; no payment in the demo)
- Help center built from the same documents the AI answers from

**For customers (chat widget)**
- Answers from the help docs, with clickable sources ("Returns and Refunds Policy · Footwear")
- Understands follow-ups ("…and what about shoes?")
- Logged-in shoppers skip the name/email form: their account is used, so their own orders can be looked up
- Order status as a **tracking card** (Ordered → Shipped → Delivered, items, tracking number),
  only for the email that placed the order
- Says "I'm not sure" instead of guessing, with **"Yes, connect me" / "No thanks"** buttons
- "Talk to a person" at any time, 👍 / 👎 on every answer, live progress and live replies from the team

**Hand-off rules** (each one creates a ticket and moves the chat to the team inbox)
- asks for a human · asks for a refund · is angry · accepts a hand-off after "not sure"
- 2 unanswerable questions in a row

**For the support team (dashboard, login required)**
- **Inbox**: chats needing a reply first; reply to the customer, take over, hand back to the AI, close
- **✨ Suggest a reply**: the AI drafts an answer to the customer's *open* question (from the docs and
  their orders); the agent edits and sends it
- **Customer panel** next to each chat: the customer's orders, lifetime spend and ticket
- **"Why did the AI say this?"** on every AI message: intent, mood, tools used, search scores, grounding check
- **Tickets**: AI-written summary, status, priority, internal notes, **HubSpot sync** (with retry)
- **Help docs**: upload PDF / Word / Markdown / text; a search tester shows what the agent would read
- **Overview**: conversations per day, % solved by AI, helpful-answer rate (👍/👎), hand-off reasons, top topics

**Quality**
- A test set of 20 conversations (`evals/questions.yaml`) scored on route, source and content: **20/20**
- 24 automatic tests (rules, grounding, tools, HubSpot, API, store checkout and privacy) with a fake LLM

## How it works

```
                 ┌──────────────┐
  message ──────►│  understand  │  LLM labels intent / mood / refund / order no.  (+ plain-rule backups)
                 └──────┬───────┘
   ┌──────────┬─────────┼─────────────┬──────────────┐
   ▼          ▼         ▼             ▼              ▼
 handoff   smalltalk  lookup_order  retrieve ──► answer (quote first, then answer)
 (ticket)                              │              │ grounding check fails
                                       ▼              ▼
                                    not_sure ◄────────┘ ──(too many)──► handoff
```

A **LangGraph** state graph. Each step streams progress to the chat.

**Search (RAG).** Docs are split by their headings. Each section is found two ways: by meaning
(`bge-small` embeddings in **pgvector**) and by keyword (PostgreSQL full-text search). The two lists are merged
and re-ranked with a cross-encoder (`ms-marco-MiniLM`). Its score also says "this is not in the docs".

**Grounding: how it avoids making things up.** Small local models sometimes invent a rule and cite a
source anyway. So the answer step works like this:
1. The model must first **copy the exact sentences** it relies on, then answer from them.
2. Code (no AI) checks that the quotes really exist in the docs, and that most of the answer's words
   come from the docs. Otherwise the customer gets "I'm not sure, want me to connect you with the team?"

| Approach tried | Result on the hard cases |
|---|---|
| Answer + citation check | made up "service animals allowed, pets not" |
| + LLM fact-checker | missed contradictions; rejected correct answers |
| + fact-checker with reasoning | correct, but 12 s per answer |
| **Quote-first + code checks** (used) | **20/20 test set, 10/10 unseen questions, ~5-8 s** |

**Privacy.** An order is only shown when the chat's email matches the order's email. A wrong email gets
the same reply as a missing order, so nothing leaks. Each customer chat has its own random token.

## Tech stack

| Layer | Tech |
|---|---|
| Agent | LangGraph, Ollama (Qwen3 8B, local), Pydantic structured outputs |
| Search | PostgreSQL 17 + pgvector (HNSW), full-text search, fastembed (bge-small, MiniLM re-ranker) |
| API | FastAPI, Server-Sent Events for streaming, SQLAlchemy 2, Alembic |
| Auth | Argon2 passwords, JWT in an httpOnly cookie (team); per-chat token (customers) |
| Integrations | HubSpot CRM tickets API (create + update, retry on failure) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 (store + chat widget + team dashboard) |
| Quality | 20-conversation eval set, pytest, Playwright end-to-end |

The LLM sits behind a two-method interface (`helpdesk/llm.py`), so it can be switched to Claude, Gemini or
OpenAI by adding one class.

## Project structure

```
helpdesk/
├── helpdesk/
│   ├── agent/        graph.py (LangGraph flow), prompts.py, rules.py, grounding.py
│   ├── api/          main.py, routes_chat.py (public, streaming), routes_admin.py, routes_auth.py
│   ├── chat.py       one chat turn: save → run agent → save reply
│   ├── search.py     hybrid search + re-ranking
│   ├── ingest.py     PDF / DOCX / MD / TXT → sections → embeddings
│   ├── tools.py      order look-up, tickets
│   ├── hubspot.py    ticket sync
│   ├── llm.py        model interface (Ollama)
│   └── models.py     database tables
├── evals/            questions.yaml (20 conversations) + run_evals.py
├── seed/docs/        demo store help docs (invented company)
├── scripts/          seed.py, start.sh
├── migrations/       Alembic
├── web/              Next.js: store + chat widget, dashboard
└── tests/
```

## Getting started

**Requirements:** Python 3.11 + [uv](https://docs.astral.sh/uv/), Node.js 20+, Docker,
[Ollama](https://ollama.com) and about 6 GB of disk for the model. Apple Silicon or a GPU recommended.

```bash
# 1. Model
brew install ollama && brew services start ollama
ollama pull qwen3:8b

# 2. Python
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# 3. Database + demo data (docs, 30 orders, team login)
docker compose up -d --wait db
.venv/bin/alembic upgrade head
.venv/bin/python scripts/seed.py

# 4. Website
cd web && npm install && cd ..

# 5. Run (API :8100 + website :3100)
./scripts/start.sh
```

Open **http://localhost:3100**.

| Who | Where | Login |
|---|---|---|
| Shopper | the store, http://localhost:3100 | sign up, or **sara@example.com / sara-demo-1** (has orders 1042-1044) |
| Support team | footer → Staff login, or http://localhost:3100/staff/login | **admin@northwind.example / northwind-demo** |

Try: buy something, then ask the chat "Where is my order <number>?"; or ask for a refund and answer it
from the team inbox.

### Connect HubSpot (optional)
1. Create a free HubSpot account → **Development → Keys → Service Keys → Create service key**.
2. Add the `tickets` scope (read + write). Create the key, then **Show → Copy**.
3. Put it in `.env` as `HELPDESK_HUBSPOT_TOKEN=...` and restart. New tickets show **HubSpot ✓**, and
   status changes (Open → In progress → Solved) move the HubSpot ticket (New → Waiting on us → Closed).

## Tests

```bash
.venv/bin/python -m pytest -q             # fast, fake LLM (needs the database running)
.venv/bin/python evals/run_evals.py       # the real agent on 20 conversations (~2.5 min)
```

## API

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/chat/start` | `{name, email}` → chat id + token |
| `POST` | `/api/chat/{id}/messages` | Send a message; the reply streams as SSE (`status`, `token`, `done`) |
| `GET` | `/api/chat/{id}?after=` | Messages (for team replies); needs `X-Chat-Token` |
| `POST` | `/api/chat/{id}/messages/{mid}/feedback` | `{value: up\|down\|none}`: customer rates an answer |
| `GET` | `/api/admin/conversations[/{id}]` | Inbox; one chat with AI traces, tickets and the customer's orders |
| `POST` | `/api/admin/conversations/{id}/suggest` | AI-drafted reply for the team member |
| `POST` | `/api/admin/conversations/{id}/reply` · `/status` | Team reply · take over / hand back / close |
| `GET` / `PATCH` | `/api/admin/tickets[/{id}]` | Tickets: status, priority, notes (synced to HubSpot) |
| `GET` / `POST` / `DELETE` | `/api/admin/docs` | Help docs; `GET /api/admin/search?q=` tests retrieval |
| `GET` | `/api/admin/stats?days=7` | Dashboard numbers |
| `POST` | `/api/auth/signup` · `/login` · `/logout` | Team accounts |
| `GET` | `/api/store/products[/{slug}]` | Catalogue (`category`, `q`, `sale`, `new` filters) |
| `POST` | `/api/store/auth/signup` · `/login` · `/logout` | Shopper accounts (separate from team accounts) |
| `POST` / `GET` | `/api/store/orders[/{number}]` | Place an order (prices checked on the server) · my orders |
| `GET` | `/api/store/help[/{slug}]` | Help center pages |

## Known limits

- An 8B local model is slower than hosted models: about 5-8 s per answer on an M1 Pro.
- It is careful by design: questions the docs only hint at get "not sure" rather than a guess.
- The customer's email is not verified (demo). In production, use the store's login or an email link.
- English only.

## Demo data

Northwind Outfitters, its policies, customers and orders are invented for this demo.
