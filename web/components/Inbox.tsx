"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ChatStatus, type Conversation, type ConversationSummary, type Message, type Trace } from "@/lib/api";
import { Formatted } from "./ChatWidget";
import { PageHeader } from "./DashboardShell";
import { useToast } from "./Toast";
import { Avatar, Badge, ErrorBanner, PRIORITY_TONE, Spinner, TICKET_STATUS, clock, timeAgo } from "./ui";

const FILTERS = [
  { key: "needs", label: "Needs you" },
  { key: "ai", label: "AI handling" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

function matches(c: ConversationSummary, f: Filter) {
  if (f === "needs") return c.status === "human";
  if (f === "ai") return c.status === "ai";
  if (f === "closed") return c.status === "closed";
  return true;
}

export function Inbox() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("c");
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    api.conversations().then(setList).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/staff/login?next=/dashboard/inbox");
      else setError(e.message);
    });
  }, [router]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 4000);
    return () => clearInterval(t);
  }, [loadList]);

  const shown = (list ?? []).filter((c) => matches(c, filter));
  const count = (f: Filter) => (list ?? []).filter((c) => matches(c, f)).length;

  return (
    <>
      <PageHeader title="Inbox" sub="Every customer chat. Ones the AI handed to your team are at the top." />
      {error && <div className="px-4 pt-4 sm:px-8"><ErrorBanner message={error} onClose={() => setError(null)} /></div>}
      <div className="grid lg:h-[calc(100vh-91px)] lg:grid-cols-[340px_1fr] lg:overflow-hidden">
        {/* list */}
        <div className={`border-r border-line bg-card lg:overflow-y-auto ${selected ? "hidden lg:block" : ""}`}>
          <div role="tablist" aria-label="Filter conversations" className="flex gap-1 overflow-x-auto border-b border-line p-2">
            {FILTERS.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition ${filter === f.key ? "bg-ink text-white" : "text-muted hover:bg-soft"}`}>
                {f.label} <span className="opacity-70">{count(f.key)}</span>
              </button>
            ))}
          </div>
          {!list ? (
            <div className="flex justify-center p-10 text-muted"><Spinner /></div>
          ) : shown.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">
              {filter === "needs" ? "Nothing waiting for the team. 🎉" : "No conversations yet. Start one from the demo store."}
            </p>
          ) : (
            <ul>
              {shown.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/inbox?c=${c.id}`} scroll={false}
                    className={`block border-b border-line px-4 py-3 transition ${selected === c.id ? "bg-soft" : "hover:bg-bg"}`}>
                    <div className="flex items-center gap-2">
                      <Avatar name={c.customer_name} className="h-8 w-8" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{c.customer_name}</p>
                          <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.updated_at)}</span>
                        </div>
                        <p className="truncate text-xs text-muted">
                          {c.last_message ? `${c.last_message.role === "customer" ? "" : c.last_message.role === "agent" ? "You: " : "AI: "}${c.last_message.content}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-10">
                      <StatusBadge status={c.status} waiting={c.waiting_for_team} />
                      {c.ticket && <Badge tone={PRIORITY_TONE[c.ticket.priority as keyof typeof PRIORITY_TONE] ?? "gray"}>#{c.ticket.number} · {c.ticket.priority}</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* detail */}
        <div className={`min-h-0 lg:h-full ${selected ? "" : "hidden lg:block"}`}>
          {selected ? <Detail key={selected} id={selected} onChange={loadList} /> : (
            <div className="flex h-full items-center justify-center p-10 text-sm text-muted">Pick a conversation to read it.</div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status, waiting }: { status: ChatStatus; waiting: boolean }) {
  if (status === "human") return <Badge tone={waiting ? "red" : "amber"}>{waiting ? "● Needs reply" : "With team"}</Badge>;
  if (status === "closed") return <Badge>Closed</Badge>;
  return <Badge tone="green">AI handling</Badge>;
}

function Detail({ id, onChange }: { id: string; onChange: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(() => {
    api.conversation(id).then((x) => {
      setC(x);
      if (x.messages.length !== count.current) {
        count.current = x.messages.length;
        setTimeout(() => bottom.current?.parentElement?.scrollTo({ top: 1e9 }), 30);
      }
    }).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
      onChange();
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    setDrafting(true);
    try {
      const r = await api.suggest(id);
      setReply(r.text);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDrafting(false);
    }
  };

  if (!c) return <div className="flex justify-center p-10 text-muted">{error ? <ErrorBanner message={error} /> : <Spinner />}</div>;
  const ticket = c.tickets.find((t) => t.status !== "solved") ?? c.tickets[c.tickets.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col xl:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-card px-4 py-3 sm:px-6">
          <Link href="/dashboard/inbox" className="text-sm text-muted lg:hidden" aria-label="Back to the list">←</Link>
          <Avatar name={c.customer_name} className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c.customer_name}</p>
            <p className="truncate text-xs text-muted">{c.customer_email} · started {timeAgo(c.created_at)}</p>
          </div>
          <StatusBadge status={c.status} waiting={c.waiting_for_team} />
          <div className="flex gap-2">
            {c.status === "ai" && <Action onClick={() => act(() => api.setChatStatus(id, "human"), "You took over the chat")} disabled={busy}>Take over</Action>}
            {c.status === "human" && <Action onClick={() => act(() => api.setChatStatus(id, "ai"), "Handed back to the AI")} disabled={busy}>Hand back to AI</Action>}
            {c.status !== "closed" && <Action onClick={() => act(() => api.setChatStatus(id, "closed"), "Chat closed")} disabled={busy}>Close chat</Action>}
          </div>
        </div>
        {c.handoff_reason && c.status !== "closed" && (
          <p className="border-b border-line bg-warn-soft px-4 py-2 text-xs text-warn sm:px-6">
            <b>Handed to the team:</b> {c.handoff_reason}
          </p>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto bg-bg px-4 py-5 sm:px-6">
          {c.messages.map((m) => <Row key={m.id} m={m} />)}
          <div ref={bottom} />
        </div>

        {c.status !== "closed" ? (
          <form
            onSubmit={(e) => { e.preventDefault(); const t = reply.trim(); if (t) act(async () => { await api.reply(id, t); setReply(""); }, "Reply sent to the customer"); }}
            className="border-t border-line bg-card p-3 sm:px-6"
          >
            <div className="rounded-xl border border-line bg-bg transition focus-within:border-accent focus-within:bg-white focus-within:ring-2 focus-within:ring-accent/15">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} aria-label="Reply to the customer"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }}
                placeholder={c.status === "ai" ? "Write to the customer (this takes the chat over from the AI)…" : "Write to the customer…"}
                className="block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm outline-none" />
              <div className="flex items-center justify-between gap-3 border-t border-line/70 px-2 py-1.5">
                <button type="button" onClick={suggest} disabled={drafting}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-info transition hover:bg-info-soft disabled:opacity-60">
                  {drafting ? <Spinner className="h-3 w-3" /> : <span aria-hidden>✨</span>}
                  {drafting ? "Drafting…" : reply ? "Re-draft with AI" : "Suggest a reply"}
                </button>
                <div className="flex items-center gap-3">
                  <span className="hidden text-[11px] text-muted md:block">⌘/Ctrl + Enter</span>
                  <button disabled={busy || !reply.trim()} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-40">
                    {busy && <Spinner />} Send
                  </button>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="border-t border-line bg-card px-6 py-3 text-center text-sm text-muted">
            This chat is closed. <button onClick={() => act(() => api.setChatStatus(id, "human"), "Chat reopened")} className="font-medium text-accent hover:underline">Reopen it</button>
          </div>
        )}
      </div>

      <aside className="space-y-5 overflow-y-auto border-t border-line bg-card p-4 xl:w-80 xl:shrink-0 xl:border-l xl:border-t-0">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</p>
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar name={c.customer_name} className="h-10 w-10" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{c.customer_name}</p>
              <p className="truncate text-xs text-muted">{c.customer_email}</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-bg p-2"><dt className="text-muted">Orders</dt><dd className="text-base font-semibold">{c.orders.length}</dd></div>
            <div className="rounded-lg bg-bg p-2"><dt className="text-muted">Lifetime spend</dt><dd className="text-base font-semibold">${c.orders.reduce((a, o) => a + o.total, 0).toFixed(0)}</dd></div>
          </dl>
        </section>

        {ticket && (
          <section className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Ticket <span className="font-mono normal-case">#{ticket.number}</span></p>
              <Link href="/dashboard/tickets" className="text-xs text-accent hover:underline">All tickets →</Link>
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-snug">{ticket.subject}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={TICKET_STATUS[ticket.status].tone}>{TICKET_STATUS[ticket.status].label}</Badge>
              <Badge tone={PRIORITY_TONE[ticket.priority]}>{ticket.priority} priority</Badge>
              <Badge>{ticket.category}</Badge>
              <HubspotBadge status={ticket.hubspot.status} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{ticket.summary}</p>
            <div className="mt-3">
              {ticket.status !== "solved" ? (
                <Action onClick={() => act(() => api.updateTicket(ticket.id, { status: "solved" }), `Ticket #${ticket.number} solved`)} disabled={busy} primary>Mark solved</Action>
              ) : (
                <Action onClick={() => act(() => api.updateTicket(ticket.id, { status: "open" }), `Ticket #${ticket.number} reopened`)} disabled={busy}>Reopen</Action>
              )}
            </div>
          </section>
        )}

        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recent orders</p>
          {c.orders.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No orders with this email.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {c.orders.map((o) => (
                <li key={o.number} className="rounded-xl border border-line p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">#{o.number}</span>
                    <Badge tone={o.status === "delivered" ? "green" : o.status === "shipped" ? "blue" : "amber"}>{o.status}</Badge>
                  </div>
                  <p className="mt-1 text-muted">{o.items.join(", ")}</p>
                  <p className="mt-1 flex justify-between text-muted">
                    <span>{new Date(o.placed_at).toLocaleDateString([], { month: "short", day: "numeric" })}{o.tracking ? ` · ${o.carrier}` : ""}</span>
                    <span className="font-semibold text-ink">${o.total.toFixed(2)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

export function HubspotBadge({ status }: { status: string }) {
  if (status === "synced") return <Badge tone="green">HubSpot ✓</Badge>;
  if (status === "failed") return <Badge tone="red">HubSpot sync failed</Badge>;
  if (status === "pending") return <Badge tone="blue">HubSpot syncing…</Badge>;
  return <Badge>Not in HubSpot</Badge>;
}

function Action({ children, onClick, disabled, primary = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${primary ? "bg-accent text-white hover:bg-accent-strong" : "border border-line bg-card hover:bg-soft"}`}>
      {children}
    </button>
  );
}

function Row({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  if (m.meta?.route === "event") return <p className="text-center text-xs text-muted">{m.content}</p>;
  const customer = m.role === "customer";
  return (
    <div className={`flex flex-col ${customer ? "items-start" : "items-end"}`}>
      <span className="mb-1 px-1 text-[11px] text-muted">
        {customer ? "Customer" : m.role === "agent" ? `${m.author || "Team"} (team)` : "AI assistant"} · {clock(m.created_at)}
      </span>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        customer ? "rounded-tl-md bg-card ring-1 ring-line" : m.role === "agent" ? "rounded-tr-md bg-accent text-white" : "rounded-tr-md bg-soft"}`}>
        <Formatted text={m.content} />
      </div>
      {m.meta?.feedback && (
        <span className="mt-1 text-[11px] text-muted">Customer rated this {m.meta.feedback === "up" ? "👍 helpful" : "👎 not helpful"}</span>
      )}
      {m.sources?.length > 0 && (
        <p className="mt-1 max-w-[85%] text-right text-[11px] text-muted">
          Sources: {m.sources.map((s) => s.heading ? `${s.document} › ${s.heading}` : s.document).join(" · ")}
        </p>
      )}
      {m.trace && m.trace.route && (
        <>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 text-[11px] font-medium text-info hover:underline">
            {open ? "Hide" : "Why did the AI say this?"}
          </button>
          {open && <TraceView t={m.trace} />}
        </>
      )}
    </div>
  );
}

const ROUTE_LABEL: Record<string, string> = {
  answer: "Answered from the help docs",
  order: "Used the order look-up tool",
  not_sure: "Not in the docs: offered a human",
  handoff: "Handed off to the team",
  smalltalk: "Small talk",
};

function TraceView({ t }: { t: Trace }) {
  const a = t.analysis;
  const check = t.check as Record<string, unknown> | null | undefined;
  return (
    <div className="mt-1.5 w-full max-w-[85%] rounded-xl border border-info/20 bg-info-soft/60 p-3 text-xs leading-relaxed">
      <p className="font-semibold text-info">{ROUTE_LABEL[t.route ?? ""] ?? t.route} · {t.seconds}s · {t.model}</p>
      {a && (
        <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-2 gap-y-0.5 text-muted">
          <dt>Intent</dt><dd className="text-ink">{a.intent}</dd>
          <dt>Mood</dt><dd className="text-ink">{a.mood}{a.refund_request ? " · refund request" : ""}</dd>
          {a.order_number && (<><dt>Order number</dt><dd className="text-ink">{a.order_number}</dd></>)}
          <dt>Understood as</dt><dd className="text-ink">“{a.standalone_question}”</dd>
          {t.handoff_reason && (<><dt>Hand-off reason</dt><dd className="text-ink">{t.handoff_reason}</dd></>)}
        </dl>
      )}
      {!!t.tool_calls?.length && (
        <div className="mt-2">
          <p className="font-semibold text-ink">Tools used</p>
          <ul className="mt-0.5 space-y-0.5 text-muted">
            {t.tool_calls.map((c, i) => (
              <li key={i}>
                <code className="rounded bg-card px-1">{c.tool}</code>{" "}
                {c.tool === "search_docs" && Array.isArray(c.top)
                  ? (c.top as { label: string; score: number }[]).slice(0, 3).map((h) => `${h.label} (${h.score})`).join(" · ")
                  : Object.entries(c).filter(([k]) => k !== "tool").map(([k, v]) => `${k}: ${String(v)}`).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {check && (
        <p className="mt-2 text-muted">
          <span className="font-semibold text-ink">Grounding check: </span>
          {"coverage" in check
            ? `${check.quotes_found}/${check.quotes} quotes found in the docs · ${Math.round(Number(check.coverage) * 100)}% of words from the docs (needs ${Math.round(Number(check.needed) * 100)}%)`
            : JSON.stringify(check)}
          {typeof check.draft === "string" && check.draft && <span className="mt-1 block italic">Rejected draft: “{check.draft}”</span>}
        </p>
      )}
    </div>
  );
}
