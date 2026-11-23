"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Ticket } from "@/lib/api";
import { PageHeader } from "./DashboardShell";
import { HubspotBadge } from "./Inbox";
import { useToast } from "./Toast";
import { Badge, ErrorBanner, PRIORITY_TONE, Spinner, TICKET_STATUS, timeAgo } from "./ui";

const FILTERS = [
  { key: "active", label: "Open & in progress" },
  { key: "solved", label: "Solved" },
  { key: "all", label: "All" },
] as const;

export function Tickets() {
  const router = useRouter();
  const toast = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.tickets().then(setTickets).catch((e) => {
      if (e instanceof ApiError && e.status === 401) router.replace("/staff/login?next=/dashboard/tickets");
      else setError(e.message);
    });
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const shown = (tickets ?? []).filter((t) =>
    filter === "all" ? true : filter === "solved" ? t.status === "solved" : t.status !== "solved");

  const update = (t: Ticket, b: Parameters<typeof api.updateTicket>[1]) =>
    api.updateTicket(t.id, b).then((nt) => {
      setTickets((all) => all?.map((x) => (x.id === nt.id ? nt : x)) ?? null);
      toast(b.note ? "Note added" : b.status ? `Ticket #${t.number}: ${b.status.replace("_", " ")}` : `Ticket #${t.number} updated`);
    }).catch((e) => toast(e.message, "error"));

  return (
    <>
      <PageHeader title="Tickets" sub="Created by the AI when a chat needs a person. Every change is copied to HubSpot.">
        <div role="tablist" className="flex gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filter === f.key ? "bg-ink text-white" : "text-muted hover:bg-soft"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="px-4 py-6 sm:px-8">
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
        {!tickets ? (
          <div className="flex justify-center p-10 text-muted"><Spinner /></div>
        ) : shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            No tickets here. Ask the demo chat for a refund or a human to create one.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-card">
            {shown.map((t) => (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <button onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}
                  className="grid w-full grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-bg sm:grid-cols-[70px_1fr_auto]">
                  <span className="font-mono text-sm text-muted">#{t.number}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{t.subject}</span>
                    <span className="block truncate text-xs text-muted">{t.customer_email} · {timeAgo(t.created_at)}</span>
                  </span>
                  <span className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:justify-end">
                    <Badge tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Badge>
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                    <Badge>{t.category}</Badge>
                    <HubspotBadge status={t.hubspot.status} />
                  </span>
                </button>
                {open === t.id && <TicketDetail t={t} update={update} onSync={() => api.syncTicket(t.id).then(load).catch((e) => setError(e.message))} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function TicketDetail({ t, update, onSync }: { t: Ticket; update: (t: Ticket, b: { status?: string; priority?: string; note?: string }) => Promise<void>; onSync: () => void }) {
  const [note, setNote] = useState("");
  const select = "rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm";
  return (
    <div className="grid gap-5 border-t border-line bg-bg px-4 py-4 sm:px-6 md:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Summary for the team</p>
        <p className="mt-1 text-sm leading-relaxed">{t.summary}</p>
        {t.order_number && <p className="mt-2 text-sm">Order <b>{t.order_number}</b></p>}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">History</p>
        <ul className="mt-1 space-y-1 text-sm">
          <li className="text-muted">Created by the AI assistant · {new Date(t.created_at).toLocaleString()}</li>
          {t.notes.map((n, i) => (
            <li key={i}><span className="font-medium">{n.by}:</span> <span className="text-muted">{n.text}</span></li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) update(t, { note: note.trim() }).then(() => setNote("")); }} className="mt-3 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" aria-label="Internal note"
            className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-sm outline-none focus:border-accent" />
          <button className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40" disabled={!note.trim()}>Add</button>
        </form>
      </div>
      <div className="space-y-3 text-sm">
        <label className="flex items-center justify-between gap-3">
          <span className="text-muted">Status</span>
          <select className={select} value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
            <option value="open">Open</option><option value="in_progress">In progress</option><option value="solved">Solved</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-muted">Priority</span>
          <select className={select} value={t.priority} onChange={(e) => update(t, { priority: e.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">HubSpot</span>
          <span className="flex items-center gap-2">
            <HubspotBadge status={t.hubspot.status} />
            {t.hubspot.status === "failed" && <button onClick={onSync} className="text-xs font-medium text-accent hover:underline">Retry</button>}
          </span>
        </div>
        {t.hubspot.status === "failed" && <p className="text-xs text-danger">{t.hubspot.error}</p>}
        {t.hubspot.id && <p className="text-xs text-muted">HubSpot ticket id {t.hubspot.id}</p>}
        {t.conversation_id && (
          <Link href={`/dashboard/inbox?c=${t.conversation_id}`} className="inline-block rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold hover:bg-soft">
            Open the conversation →
          </Link>
        )}
      </div>
    </div>
  );
}
