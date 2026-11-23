"""Run the 20 test conversations against the real agent and score it.

    python evals/run_evals.py              # all
    python evals/run_evals.py -k order     # only ids containing "order"

Each case runs in a fresh conversation, then is deleted (with any ticket it created).
Results: printed table + evals/results/latest.json. Exit code 1 if anything fails.
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import yaml  # noqa: E402
from sqlalchemy import delete  # noqa: E402

from helpdesk import chat  # noqa: E402
from helpdesk.db import SessionLocal  # noqa: E402
from helpdesk.models import Conversation, Ticket  # noqa: E402


def run_case(case: dict) -> dict:
    with SessionLocal() as db:
        c = chat.start(db, "Eval Bot", case.get("email", "sara@example.com"))
        t0 = time.monotonic()
        try:
            msg = None
            for turn in case["turns"]:
                for ev in chat.run_turn(db, c, turn):
                    if ev["type"] == "done":
                        msg = ev["message"]
            reply = msg["content"] if msg else ""
            route = msg["meta"].get("route") if msg else None
            sources = [s["document"] for s in (msg["sources"] if msg else [])]
        finally:
            db.execute(delete(Ticket).where(Ticket.conversation_id == c.id))
            db.execute(delete(Conversation).where(Conversation.id == c.id))
            db.commit()

    checks = {"route": route == case["route"]}
    if case.get("source"):
        checks["source"] = case["source"] in sources
    if case.get("any"):
        checks["content"] = any(w.lower() in reply.lower() for w in case["any"])
    return {"id": case["id"], "passed": all(checks.values()), "checks": checks, "route": route,
            "expected_route": case["route"], "sources": sources, "reply": reply,
            "seconds": round(time.monotonic() - t0, 1)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("-k", help="only cases whose id contains this")
    args = p.parse_args()
    cases = yaml.safe_load((ROOT / "evals" / "questions.yaml").read_text())
    if args.k:
        cases = [c for c in cases if args.k in c["id"]]

    results = []
    for case in cases:
        r = run_case(case)
        results.append(r)
        mark = "PASS" if r["passed"] else "FAIL"
        bad = ", ".join(k for k, ok in r["checks"].items() if not ok)
        print(f"{mark}  {r['id']:<18} {r['route'] or '-':<10} {r['seconds']:>5.1f}s  {bad}", flush=True)
        if not r["passed"]:
            print(f"      expected {r['expected_route']}; sources {r['sources']}; reply: {r['reply'][:160]!r}")

    n = len(results)
    passed = sum(r["passed"] for r in results)
    by_check = {k: f"{sum(r['checks'].get(k, True) for r in results)}/{n}" for k in ("route", "source", "content")}
    print(f"\n{passed}/{n} passed  ({passed / n:.0%})   route {by_check['route']}  source {by_check['source']}  "
          f"content {by_check['content']}   avg {sum(r['seconds'] for r in results) / n:.1f}s per case")
    out = ROOT / "evals" / "results"
    out.mkdir(exist_ok=True)
    (out / "latest.json").write_text(json.dumps({"passed": passed, "total": n, "results": results}, indent=1))
    sys.exit(0 if passed == n else 1)


if __name__ == "__main__":
    main()
