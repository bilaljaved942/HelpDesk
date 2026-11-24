"""The support agent, as a LangGraph state graph.

                 ┌──────────────┐
  message ──────►│  understand  │  model labels intent / mood / refund / order no.
                 └──────┬───────┘  + plain rules (rules.py) as a backup
                        │ decide()
   ┌──────────┬─────────┼─────────────┬──────────────┐
   ▼          ▼         ▼             ▼              ▼
 handoff   smalltalk  lookup_order  retrieve ──► answer
 (ticket)                              │ nothing      │ not answerable, or not
                                       ▼ relevant     ▼ backed by the docs
                                    not_sure ◄────────┘
                                       │ too many in a row
                                       ▼
                                    handoff

Nodes send live events to the chat window through LangGraph's stream writer:
  {"type": "status", "text": "Searching the help docs…"}   progress line
  {"type": "token",  "text": "..."}                          answer text, as it is written
The database session and the LLM come in through the run config, so tests can pass fakes.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langchain_core.runnables import RunnableConfig

from helpdesk.agent import rules
from helpdesk.agent.grounding import quote_found, word_coverage
from helpdesk.agent.prompts import (ANSWER_SYSTEM, ORDER_SYSTEM, TICKET_SYSTEM, UNDERSTAND_SYSTEM, Analysis,
                                    GroundedAnswer, TicketDraft)
from helpdesk.search import search
from helpdesk.settings import get_settings
from helpdesk.tools import add_ticket_note, create_ticket, lookup_order, open_ticket_for



class State(TypedDict, total=False):
    # input
    conversation_id: str
    customer_name: str
    customer_email: str
    message: str
    history: list[dict]          # [{"role": "customer"|"ai"|"agent", "content": str}]
    offered_handoff: bool        # our last reply asked "want me to connect you with the team?"
    failures: int                # "not sure" replies in a row so far
    # worked out along the way
    analysis: dict
    hits: list[dict]
    # output
    route: str                   # answer | order | not_sure | handoff | smalltalk
    reply: str
    sources: list[dict]
    handoff_reason: str
    ticket_number: int | None
    tool_calls: list[dict]
    check: dict                  # grounding check result (shown in the dashboard trace)
    order: dict                  # order facts, shown as a card in the chat


def _emit(kind: str, text: str) -> None:
    try:
        get_stream_writer()({"type": kind, "text": text})
    except Exception:            # not running in streaming mode (e.g. some tests)
        pass


def _deps(config: RunnableConfig) -> tuple[Any, Any]:
    c = config["configurable"]
    return c["db"], c["llm"]


def _transcript(history: list[dict], latest: str | None = None, turns: int | None = None) -> str:
    turns = turns or get_settings().history_turns
    who = {"customer": "Customer", "ai": "Assistant", "agent": "Support agent", "system": "System"}
    lines = [f"{who.get(m['role'], m['role'])}: {m['content']}" for m in history[-turns:]]
    if latest is not None:
        lines.append(f"Customer (latest): {latest}")
    return "\n".join(lines) or "(no earlier messages)"


# ---------------------------------------------------------------- nodes

def understand(state: State, config: RunnableConfig) -> State:
    _, llm = _deps(config)
    msg = state["message"]
    try:
        a = llm.json(UNDERSTAND_SYSTEM, _transcript(state.get("history", []), msg), Analysis).model_dump()
    except Exception:
        a = Analysis(intent="question", mood="calm", refund_request=False, standalone_question=msg).model_dump()
    # Rules back up the model. A refund needs the model AND the words to agree: small models also
    # label "can I cancel?" as a refund, and "how long does a refund take?" is a docs question.
    a["refund_request"] = a["refund_request"] and rules.wants_refund(msg)
    if rules.looks_angry(msg):
        a["mood"] = "angry"
    if rules.wants_human(msg):
        a["intent"] = "talk_to_human"
    num = rules.order_number(msg)
    if num:
        a["order_number"] = num
    elif a.get("order_number"):
        a["order_number"] = re.sub(r"\D", "", a["order_number"]) or None
        if a["order_number"] and a["order_number"] not in msg:
            a["order_number"] = None          # the model must not invent order numbers
    if state.get("offered_handoff") and rules.is_yes(msg):
        a["intent"] = "yes"
    if rules.is_greeting(msg):
        a["intent"] = "greeting"
    elif rules.is_thanks(msg):
        a["intent"] = "thanks"
    if not a.get("standalone_question"):
        a["standalone_question"] = msg
    return {"analysis": a, "tool_calls": []}


def decide(state: State) -> str:
    a = state["analysis"]
    if a["intent"] == "talk_to_human":
        return "handoff"
    if a["mood"] == "angry":
        return "handoff"
    if a["refund_request"]:
        return "handoff"
    if a["intent"] == "yes" and state.get("offered_handoff"):
        return "handoff"
    if a["intent"] in ("greeting", "thanks") or (a["intent"] == "no" and state.get("offered_handoff")):
        return "smalltalk"
    if a["intent"] == "order_status":
        return "lookup_order"
    return "retrieve"


def handoff_reason(state: State) -> str:
    a = state.get("analysis", {})
    if state.get("handoff_reason"):
        return state["handoff_reason"]
    if a.get("intent") == "talk_to_human":
        return "Customer asked for a person"
    if a.get("refund_request"):
        return "Refund request (needs a human)"
    if a.get("mood") == "angry":
        return "Customer is upset"
    if a.get("intent") == "yes":
        return "Question not covered by the help docs; customer accepted a hand-off"
    return "Assistant could not answer"


def smalltalk(state: State, config: RunnableConfig) -> State:
    a = state["analysis"]
    name = (state.get("customer_name") or "").split(" ")[0]
    if a["intent"] == "greeting":
        reply = f"Hi{' ' + name if name else ''}! 👋 How can I help you today?"
    elif a["intent"] == "no":
        reply = "No problem! Is there anything else I can help you with?"
    else:
        reply = "You're welcome! Is there anything else I can help with?"
    _emit("token", reply)
    return {"route": "smalltalk", "reply": reply, "sources": [], "failures": 0, "offered_handoff": False}


def retrieve(state: State, config: RunnableConfig) -> State:
    db, _ = _deps(config)
    _emit("status", "Searching the help docs…")
    q = state["analysis"]["standalone_question"]
    hits = search(db, q, k=get_settings().top_k)
    return {"hits": [h.__dict__ | {"label": h.label} for h in hits],
            "tool_calls": [*state.get("tool_calls", []),
                           {"tool": "search_docs", "query": q,
                            "top": [{"label": h.label, "score": round(h.score, 2)} for h in hits]}]}


def has_relevant(state: State) -> str:
    hits = state.get("hits", [])
    return "answer" if hits and hits[0]["score"] >= get_settings().min_relevance else "not_sure"


# An answer must be backed by the docs: with valid quotes, most of its words must come from the
# sources; with no usable quotes (the model sometimes skips them), nearly all of them must.
MIN_COVERAGE_WITH_QUOTES = 0.6
MIN_COVERAGE_NO_QUOTES = 0.8


def answer(state: State, config: RunnableConfig) -> State:
    _, llm = _deps(config)
    s = get_settings()
    hits = state["hits"]
    sources = "\n\n".join(f"[{i}] {h['label']}\n{h['text']}" for i, h in enumerate(hits, 1))
    question = state["analysis"]["standalone_question"]
    chat = _transcript(state.get("history", []), state["message"], turns=s.history_turns)

    _emit("status", "Checking our policies…")
    try:
        r = llm.json(ANSWER_SYSTEM.format(sources=sources), f"Chat so far:\n{chat}\n\nQuestion to answer: {question}",
                     GroundedAnswer)
    except Exception:
        return {"route": "not_sure", "check": {"error": "model output unreadable"}}

    # Checks that need no AI (grounding.py)
    quoted = sorted({e.source for e in r.evidence
                     if 1 <= e.source <= len(hits) and quote_found(e.quote, hits[e.source - 1]["text"])})
    text = r.answer.strip()
    coverage = word_coverage(text, [h["text"] for h in hits])
    need = MIN_COVERAGE_WITH_QUOTES if quoted else MIN_COVERAGE_NO_QUOTES
    check = {"answerable": r.answerable, "quotes": len(r.evidence), "quotes_found": len(quoted),
             "coverage": round(coverage, 2), "needed": need}
    if not (r.answerable and text and coverage >= need):
        return {"route": "not_sure", "check": check | {"draft": text}}

    # Sources shown to the customer: the ones quoted, else the piece that shares the most words.
    if not quoted:
        quoted = [max(range(1, len(hits) + 1), key=lambda i: word_coverage(text, [hits[i - 1]["text"]]))]
    _emit("token", text)
    return {
        "route": "answer",
        "reply": text,
        "check": check,
        "sources": [{"n": i, "document": hits[i - 1]["document"], "heading": hits[i - 1]["heading"],
                     "snippet": hits[i - 1]["text"][:280], "score": round(hits[i - 1]["score"], 2)} for i in quoted],
        "failures": 0,
        "offered_handoff": False,
    }


def route_after_answer(state: State) -> str:
    return END if state.get("route") == "answer" else "not_sure"


def not_sure(state: State, config: RunnableConfig) -> State:
    failures = state.get("failures", 0) + 1
    if failures >= get_settings().max_failures:
        return {"failures": failures, "route": "handoff",
                "handoff_reason": f"Assistant could not answer {failures} questions in a row"}
    reply = ("I'm not sure about that one, and I don't want to guess. "
             "Would you like me to connect you with our team?")
    _emit("reset", "")
    _emit("token", reply)
    return {"route": "not_sure", "reply": reply, "sources": [], "failures": failures, "offered_handoff": True}


def route_after_not_sure(state: State) -> str:
    return "handoff" if state.get("route") == "handoff" else END


def lookup_order_node(state: State, config: RunnableConfig) -> State:
    db, llm = _deps(config)
    number = state["analysis"].get("order_number")
    if not number:
        # maybe mentioned earlier in the chat
        for m in reversed(state.get("history", [])):
            if m["role"] == "customer" and (number := rules.order_number(m["content"])):
                break
    if not number:
        reply = "Sure, I can check that for you. What's your order number? You'll find it in your order confirmation email."
        _emit("token", reply)
        return {"route": "order", "reply": reply, "sources": []}

    _emit("status", f"Looking up order {number}…")
    facts = lookup_order(db, number, state.get("customer_email", ""))
    calls = [*state.get("tool_calls", []), {"tool": "lookup_order", "order_number": number, "found": facts["found"]}]
    if not facts["found"]:
        reply = (f"I couldn't find order {number} for the email address you gave us. Could you double-check the "
                 "number? It's in your order confirmation email.")
        _emit("token", reply)
        return {"route": "order", "reply": reply, "sources": [], "tool_calls": calls}

    today = datetime.now(timezone.utc).strftime("%A, %b %d, %Y")
    system = ORDER_SYSTEM.format(today=today, facts=json.dumps(facts, indent=1))
    text = ""
    for piece in llm.stream(system, [{"role": "user", "content": state["message"]}]):
        text += piece
        _emit("token", piece)
    return {"route": "order", "reply": text.strip(), "tool_calls": calls, "failures": 0, "offered_handoff": False,
            "order": facts,
            "sources": [{"n": 0, "document": "Order system", "heading": f"Order {number}",
                         "snippet": f"Status: {facts['status']}", "score": 1.0}]}


_NUMBER = re.compile(r"[,(]?\s*(?:order\s*)?#?\b(\d{3,})\b\)?", re.I)


def _drop_unsaid_numbers(text: str, chat: str) -> str:
    """Remove order-like numbers the model added that never appear in the chat."""
    return _NUMBER.sub(lambda m: m.group(0) if m.group(1) in chat else "", text).strip(" ,")


def handoff(state: State, config: RunnableConfig) -> State:
    db, llm = _deps(config)
    reason = handoff_reason(state)
    a = state.get("analysis", {})
    priority = "high" if (a.get("mood") == "angry" or a.get("refund_request")) else "medium"
    existing = open_ticket_for(db, state["conversation_id"])
    calls = list(state.get("tool_calls", []))

    if existing:
        add_ticket_note(existing, f"Customer: {state['message']}", "assistant")
        if priority == "high":
            existing.priority = "high"
        ticket = existing
        calls.append({"tool": "add_ticket_note", "ticket": ticket.number})
    else:
        _emit("status", "Creating a ticket for our team…")
        # Only what is still open: messages after the last answered question (or team reply).
        hist = state.get("history", [])
        last_done = max((i for i, m in enumerate(hist)
                         if m["role"] == "agent" or m.get("route") in ("answer", "order")), default=-1)
        chat = _transcript(hist[last_done + 1:], state["message"], turns=12)
        try:
            draft = llm.json(TICKET_SYSTEM.format(reason=reason), chat, TicketDraft)
        except Exception:
            draft = TicketDraft(subject=state["message"][:80], summary=chat[-1000:], category="other")
        draft.subject = _drop_unsaid_numbers(draft.subject, chat)
        draft.summary = _drop_unsaid_numbers(draft.summary, chat)
        category = "refund" if a.get("refund_request") else draft.category
        ticket = create_ticket(db, subject=draft.subject, summary=draft.summary, category=category,
                               priority=priority, customer_email=state.get("customer_email", ""),
                               conversation_id=state["conversation_id"], order_number=a.get("order_number") or "")
        calls.append({"tool": "create_ticket", "ticket": ticket.number, "priority": priority, "category": category})

    sorry = "I'm really sorry about this. " if a.get("mood") in ("angry", "frustrated") else ""
    reply = (f"{sorry}I've passed this to our team (ticket #{ticket.number}). Someone will reply right here; "
             "we're online Mon–Fri, 8 am–6 pm PT.")
    _emit("reset", "")
    _emit("token", reply)
    return {"route": "handoff", "reply": reply, "sources": [], "handoff_reason": reason,
            "ticket_number": ticket.number, "tool_calls": calls, "offered_handoff": False}


# ---------------------------------------------------------------- graph

def build_graph():
    g = StateGraph(State)
    g.add_node("understand", understand)
    g.add_node("smalltalk", smalltalk)
    g.add_node("retrieve", retrieve)
    g.add_node("answer", answer)
    g.add_node("not_sure", not_sure)
    g.add_node("lookup_order", lookup_order_node)
    g.add_node("handoff", handoff)

    g.add_edge(START, "understand")
    g.add_conditional_edges("understand", decide,
                            ["handoff", "smalltalk", "lookup_order", "retrieve"])
    g.add_conditional_edges("retrieve", has_relevant, ["answer", "not_sure"])
    g.add_conditional_edges("answer", route_after_answer, [END, "not_sure"])
    g.add_conditional_edges("not_sure", route_after_not_sure, ["handoff", END])
    g.add_edge("smalltalk", END)
    g.add_edge("lookup_order", END)
    g.add_edge("handoff", END)
    return g.compile()


GRAPH = build_graph()
